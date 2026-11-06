// Serverless Gemini proxy. The key lives only in the GEMINI_API_KEY environment variable (never in client code).
// Two jobs only: (1) call-prep brief, (2) draft note from a call transcript.
// Every output line must cite record IDs that exist for that member; uncited or mis-cited lines are dropped.
// Any failure (no key, quota, timeout, invalid JSON) falls back to a pre-generated cached draft, so the demo never breaks.

const DATA = require('../data.json');

const MODELS = (process.env.GEMINI_MODEL ? [process.env.GEMINI_MODEL] : [])
  .concat(['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.5-flash-lite', 'gemini-1.5-flash']);
let WORKING = null; // {endpoint, model} cached across warm invocations

const HITS = new Map(); // naive per-IP rate limit (per warm instance)
function limited(ip) {
  const now = Date.now(), win = 60_000, max = 12;
  const arr = (HITS.get(ip) || []).filter(t => now - t < win);
  arr.push(now); HITS.set(ip, arr);
  return arr.length > max;
}

function endpoints(model, key) {
  return [
    { name: 'gemini-api', url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}` },
    { name: 'vertex-express', url: `https://aiplatform.googleapis.com/v1/publishers/google/models/${model}:generateContent?key=${key}` },
  ];
}

function context(p) {
  // Compact, source-tagged record list. Only what the member's chart holds; nothing else.
  const L = [];
  L.push(`MEMBER ${p.id} · ${p.name}, ${p.age}${p.sex} · ${p.plan} · ${p.program} · PCP ${p.pcp} · language: ${p.language} · authorised rep: ${p.authRep}`);
  L.push(`TODAY: Monday 9 Nov 2026 08:00. Priority score ${p.score} = clinical risk ${p.risk} × time window ${p.window} × reachability ${p.reach}.`);
  (p.signals || []).forEach(s => s.evidence.forEach(e => L.push(`[${e.rec}] (${e.src}) ${e.text}`)));
  (p.suppressed || []).forEach(s => { L.push(`SUPPRESSED ALERT ${s.title}: ${s.reason}`); s.evidence.forEach(e => L.push(`[${e.rec}] (${e.src}) ${e.text}`)); });
  (p.conflicts || []).forEach(c => L.push(`CONFLICT ${c.topic}: [${c.a.rec}] ${c.a.src} says "${c.a.value}" vs [${c.b.rec}] ${c.b.src} says "${c.b.value}". ${c.note}`));
  (p.meds || []).forEach(m => L.push(`[${m.rec}] (RX) ${m.name}: clinical "${m.clinical}" · pharmacy "${m.pharmacy}" · ${m.status}`));
  (p.labs || []).forEach(l => L.push(`[${l.rec}] (LAB) ${l.test} ${l.value} ${l.flag} on ${l.at}`));
  (p.contacts || []).forEach(c => L.push(`[${c.id}] (CON) ${c.number} ${c.type} · ${c.owner} · best ${c.bestTime} · text consent ${c.textConsent} · ${c.status}. ${c.note || ''}`));
  (p.timeline || []).forEach(t => L.push(`[${t.rec}] (${t.src}) ${t.at}: ${t.text}${t.visible ? '' : ' (NOT YET RECEIVED)'}`));
  if (p.consentGate) L.push(`CONSENT GATE [${p.consentGate.rec}]: ${p.consentGate.text} Never mention or infer its content.`);
  return L.join('\n');
}

const RULES = `You assist Maria, an RN case manager at a US health plan. Rules:
- Use ONLY the records given. Never invent facts, doses, dates, phone numbers or diagnoses.
- Every statement must cite one or more record IDs exactly as written in square brackets in the records (e.g. "RX-1004"). Use "call" only for facts that come from the call transcript.
- Plain English, short sentences, no jargon. You suggest; Maria decides. Do not give final clinical orders.
- Never reveal or infer content from a consent-gated behavioral-health record.
- Return JSON only, matching the schema.`;

function prompt(mode, p, transcript) {
  if (mode === 'brief') return `${RULES}

TASK: Write a 30-second pre-call brief for Maria: 4-5 lines, most important first (safety, then the time window, then barriers, then who to call and when). Then 3-4 open questions for the call.

RECORDS:
${context(p)}

JSON schema: {"lines":[{"text":string,"cites":[string]}],"questions":[string]}`;
  return `${RULES}

TASK: From the call transcript, draft Maria's case note. Fill only what was actually said or is in the records. 4-6 fields. Each field "source" lists record IDs and/or "call", separated by " · ". Then the follow-up tasks with owner (Maria, member, caregiver, PCP office, BH counsellor) and due date.

RECORDS:
${context(p)}

CALL TRANSCRIPT:
${transcript}

JSON schema: {"summary":string,"fields":[{"label":string,"value":string,"source":string}],"tasks":[{"task":string,"owner":string,"due":string}]}`;
}

function schema(mode) {
  const S = { type: 'STRING' }, A = (items) => ({ type: 'ARRAY', items });
  if (mode === 'brief') return { type: 'OBJECT', properties: { lines: A({ type: 'OBJECT', properties: { text: S, cites: A(S) }, required: ['text', 'cites'] }), questions: A(S) }, required: ['lines', 'questions'] };
  return { type: 'OBJECT', properties: { summary: S, fields: A({ type: 'OBJECT', properties: { label: S, value: S, source: S }, required: ['label', 'value', 'source'] }), tasks: A({ type: 'OBJECT', properties: { task: S, owner: S, due: S }, required: ['task', 'owner', 'due'] }) }, required: ['summary', 'fields', 'tasks'] };
}

async function callGemini(mode, p, transcript, key) {
  const body = JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: prompt(mode, p, transcript) }] }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 1400, responseMimeType: 'application/json', responseSchema: schema(mode) },
  });
  const tries = [];
  const order = WORKING ? [WORKING] : [];
  for (const m of MODELS) for (const e of endpoints(m, key)) order.push({ endpoint: e.name, model: m, url: e.url });
  const errors = [];
  for (const t of order) {
    const url = t.url || endpoints(t.model, key).find(e => e.name === t.endpoint).url;
    try {
      const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 14000);
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: ctl.signal });
      clearTimeout(timer);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { errors.push(`${t.endpoint}/${t.model}: ${r.status} ${(j.error && j.error.status) || ''}`); if (r.status === 429) break; continue; }
      const text = j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts.map(x => x.text || '').join('');
      if (!text) { errors.push(`${t.endpoint}/${t.model}: empty`); continue; }
      WORKING = { endpoint: t.endpoint, model: t.model };
      return { parsed: JSON.parse(text.replace(/^```json\s*|```$/g, '')), model: t.model, endpoint: t.endpoint };
    } catch (e) { errors.push(`${t.endpoint}/${t.model}: ${e.name === 'AbortError' ? 'timeout' : e.message}`); }
    if (errors.length >= 6) break;
  }
  throw new Error(errors.slice(0, 4).join(' | ') || 'no model reachable');
}

function validate(mode, p, out) {
  const ids = new Set(p.recordIds);
  const dropped = [];
  if (mode === 'brief') {
    const lines = [];
    for (const l of (out.lines || []).slice(0, 6)) {
      const cites = (l.cites || []).map(c => String(c).replace(/[\[\]]/g, '').trim());
      const ok = cites.filter(c => ids.has(c));
      if (!ok.length) { dropped.push({ text: l.text, reason: 'no valid record citation' }); continue; }
      lines.push({ text: String(l.text), cites: ok });
    }
    if (lines.length < 2) throw new Error('too few cited lines');
    return { result: { lines, questions: (out.questions || []).slice(0, 5).map(String) }, dropped };
  }
  const fields = [];
  for (const f of (out.fields || []).slice(0, 7)) {
    const toks = String(f.source || '').split(/[·,;]/).map(s => s.trim().replace(/[\[\]]/g, '')).filter(Boolean);
    const ok = toks.filter(t => t.toLowerCase() === 'call' || ids.has(t));
    if (!ok.length) { dropped.push({ text: `${f.label}: ${f.value}`, reason: 'source not in record or call' }); continue; }
    fields.push({ label: String(f.label), value: String(f.value), source: ok.join(' · ') });
  }
  if (fields.length < 2) throw new Error('too few sourced fields');
  return { result: { summary: String(out.summary || ''), fields, tasks: (out.tasks || []).slice(0, 6) }, dropped };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  let b;
  if (req.method === 'GET') {
    const q = req.query || {};
    if (q.models && process.env.GEMINI_API_KEY) {   // list models this key can use (names only)
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${process.env.GEMINI_API_KEY}`);
      const j = await r.json().catch(() => ({}));
      return res.status(200).json({ status: r.status, models: (j.models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent')).map(m => m.name), error: j.error && j.error.status });
    }
    if (!q.mode) return res.status(200).json({ ok: true, keyConfigured: !!process.env.GEMINI_API_KEY, working: WORKING });
    b = { mode: q.mode, patientId: q.patientId };   // GET ?mode=brief&patientId=P1 for quick checks
  } else if (req.method === 'POST') {
    b = req.body; if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  } else return res.status(405).json({ error: 'GET or POST' });
  const { mode, patientId } = b || {};
  const p = DATA.patients.find(x => x.id === patientId);
  if (!p || !['brief', 'note'].includes(mode)) return res.status(400).json({ error: 'bad request' });
  const transcript = String(b.transcript || p.transcript || '').slice(0, 6000);
  const cached = mode === 'brief' ? p.cachedBrief : p.cachedNote;
  const t0 = Date.now();
  const fallback = (why) => res.status(200).json({ source: 'cached', reason: why, latencyMs: Date.now() - t0, result: cached || null, dropped: [] });

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0] || 'x';
  if (limited(ip)) return fallback('rate limit: showing the pre-generated draft');
  const key = process.env.GEMINI_API_KEY;
  if (!key) return fallback('no API key configured');
  if (!p.hero && mode === 'note') return fallback('supporting member: no transcript');
  try {
    const g = await callGemini(mode, p, transcript, key);
    const v = validate(mode, p, g.parsed);
    return res.status(200).json({ source: 'gemini', model: g.model, endpoint: g.endpoint, latencyMs: Date.now() - t0, ...v });
  } catch (e) {
    console.error('ai fallback', e.message);
    return fallback(String(e.message).slice(0, 300));
  }
};
