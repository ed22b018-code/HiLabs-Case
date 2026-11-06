/* Case Workbench prototype. Vanilla JS, no build, no storage: every interaction lives in memory for the session. */
'use strict';
const S = {
  data: null, route: 'today', pid: 'P1', order: [], legacy: false, log: [],
  sig: {},       // `${pid}:${code}` -> {state:'confirmed'|'dismissed', at, reason}
  acts: {},      // `${pid}:${code}:${i}` -> true
  idMatch: {},   // pid -> 'confirmed'|'rejected'
  utr: {},       // pid -> paused
  conf: {},      // `${pid}:${topic}` -> resolved
  ai: {},        // `brief:P1` -> response | {loading:true}
  tx: {},        // pid -> transcript text
  rev: {},       // pid -> {i:true}
  edit: {},      // pid -> {i:text}
  signed: {},    // pid -> time
  tour: -1, flawFilter: 'all', health: null,
};
const SRC = {
  ADT: 'Hospital admit / discharge feed', RX: 'Pharmacy claims (PBM)', HIE: 'Health information exchange: clinical notes',
  LAB: 'Lab results', UM: 'Utilisation management: authorisations', CLM: 'Medical claims', CON: 'Contact & outreach log',
  CASE: 'Case-management notes', DIR: 'Provider directory (HiLabs-verified)', SDOH: 'Social-needs screening (HRA)',
  BH: 'Behavioral health (consent-gated)', RISK: 'Risk & quality engine', ELIG: 'Eligibility / enrolment', CBO: 'Community partner',
  'PBM pharmacy profile': 'Pharmacy benefit manager profile', call: 'This call (transcript)'
};
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ico = (n, cls = '') => `<svg class="i ${cls}"><use href="#i-${n}"/></svg>`;
const P = id => S.data.patients.find(p => p.id === id);
const first = p => p.name.split(' ')[0];
const initials = p => p.name.split(' ').map(w => w[0]).join('').slice(0, 2);
const now = () => { const d = new Date(); return `08:${String(3 + (S.log.length + Object.keys(S.sig).length) % 50).padStart(2, '0')}`; };
const recChip = (id, pid) => `<button class="rec" data-act="rec" data-rec="${esc(id)}" data-pid="${pid}">${esc(id)}</button>`;
const srcChip = s => `<span class="src" title="${esc(SRC[s] || s)}">${esc(s.length > 6 ? 'PBM' : s)}</span>`;
const flaw = id => id ? `<span class="flaw" title="Deliberately planted data flaw (see How it works)">${ico('alert')}${id}</span>` : '';
const fmtDate = s => { if (!s) return ''; const d = new Date(s.length <= 10 ? s + 'T12:00' : s); if (isNaN(d)) return s;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + (s.length > 10 ? ' ' + s.slice(11, 16) : ''); };
function toast(t) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => el.hidden = true, 2600); }

/* -------------------------------------------------------------------- boot */
async function init() {
  S.data = await (await fetch('data.json', { cache: 'no-store' })).json();
  S.order = S.data.patients.map(p => p.id);
  window.addEventListener('hashchange', route);
  document.addEventListener('click', onClick);
  document.addEventListener('input', onInput);
  $('#flawToggle').addEventListener('change', e => document.body.classList.toggle('flaws', e.target.checked));
  route();
  fetch('/api/ai').then(r => r.json()).then(j => { S.health = j; }).catch(() => { S.health = { ok: false }; });
  if (!location.hash) welcome();
}
function route() {
  const [r, id] = (location.hash.slice(1) || 'today').split('/');
  S.route = ['today', 'member', 'prep', 'doc', 'how'].includes(r) ? r : 'today';
  if (id && P(id)) S.pid = id;
  render();
}
function go(r, id) { const h = id ? `${r}/${id}` : r; if (location.hash.slice(1) === h) render(); else location.hash = h; }
function render(keepScroll) {
  const y = window.scrollY;
  document.querySelectorAll('[data-nav]').forEach(a => {
    a.classList.toggle('on', a.dataset.nav === S.route);
    if (a.dataset.nav !== 'today' && a.dataset.nav !== 'how') a.href = `#${a.dataset.nav}/${S.pid}`;
  });
  const p = P(S.pid);
  $('#sidecard').innerHTML = `<div class="lbl">Working on</div><b>${esc(p.name)}</b><div class="dim">#${p.rank} today · score ${p.score}</div><div class="dim" style="margin-top:4px">${esc(p.scenario)}</div>`;
  $('#main').innerHTML = ({ today, member, prep, doc, how })[S.route]();
  hidePop();
  if (keepScroll) window.scrollTo(0, y); else window.scrollTo(0, 0);
  if (S.tour >= 0) tourHighlight();
}

/* -------------------------------------------------------------------- TODAY */
function today() {
  const heroes = S.data.patients.filter(p => p.hero);
  const nSig = heroes.reduce((a, p) => a + p.signals.length, 0);
  const nSup = heroes.reduce((a, p) => a + p.suppressed.length, 0);
  const nRec = new Set(S.data.patients.flatMap(p => p.recordIds)).size;
  const order = S.legacy ? [...S.order].sort((a, b) => P(a).name.split(' ').pop().localeCompare(P(b).name.split(' ').pop())) : S.order;
  const rows = order.map((id, i) => {
    const p = P(id), routine = !S.legacy && i >= 5;
    const div = !S.legacy && i === 5 ? `<div class="divider">On track · routine touches this week (no signal fired)</div>` : '';
    const maxH = 18;
    return div + `<div class="qrow ${i === 0 && !S.legacy ? 'top1' : ''} ${routine ? 'routine' : ''}" id="q-${id}">
      <div class="rank">${i + 1}</div>
      <div class="who"><b>${esc(p.name)}</b><span>${p.age} · ${esc(p.plan)}</span><span>${esc(p.program)}</span></div>
      <div class="score" title="Clinical risk ${p.risk}/5 × time window ${p.window}/3 × reachability ${p.reach}">
        <div class="row" style="gap:8px"><span class="big">${p.score.toFixed(1)}</span>
        <span class="bars"><i class="r" style="height:${p.risk / 5 * maxH}px" title="Risk"></i><i class="w" style="height:${p.window / 3 * maxH}px" title="Window"></i><i style="height:${p.reach * maxH}px" title="Reach"></i></span></div>
        <span class="formula">${p.risk} × ${p.window} × ${p.reach}</span></div>
      <div class="why">${p.why.map((w, k) => `<span class="chip ${k === 0 && !routine ? 'o' : ''}">${esc(w)}</span>`).join('')}</div>
      <div class="sigs row" style="gap:4px">${p.signals.map(s => `<span class="sig ${s.code === 'S3' || s.code === 'S1' ? 'o' : ''}" title="${esc(s.title)}">${s.code}</span>`).join('') || '<span class="dim" style="font-size:12px">—</span>'}</div>
      <div class="nba">${esc(p.nba)}</div>
      <div class="ops">${S.legacy ? '' : `<button class="mv" data-act="move" data-id="${id}" data-dir="-1" title="Move up (asks why)">▲</button><button class="mv" data-act="move" data-id="${id}" data-dir="1" title="Move down (asks why)">▼</button>`}
        <button class="btn sm ${routine ? '' : 'primary'}" data-act="open" data-id="${id}">Open</button></div>
    </div>`;
  }).join('');
  const sup = S.data.patients.flatMap(p => p.suppressed.map(s => ({ p, s })));
  return `
  <section class="hello" id="hello">
    <div><div class="eyebrow">Monday 9 Nov · 08:00</div><h1>Good morning, Maria.</h1>
      <p>Over the weekend the workbench read <b>${nRec} records from 13 sources</b> for your 48 members, raised <b>${nSig} signals</b>, held back <b>${nSup} false alarm</b>, and ranked who needs you first. <b>Start with Dorothy</b>: her new heart medicine was never dispensed and a stopped one was refilled.</p>
      <div class="cta"><button class="btn orange" data-act="open" data-id="P1">Open Dorothy ${ico('arrow')}</button><button class="btn" style="background:transparent;color:#fff;border-color:#ffffff40" data-act="legacy">${S.legacy ? 'Back to ranked queue' : 'Compare: today\'s worklist'}</button></div></div>
    <div class="funnel"><div><b>${nRec}</b><span>records read</span></div><div><b>${nSig + nSup}</b><span>rules fired</span></div><div><b>${nSup}</b><span>held back (guard)</span></div><div class="hl"><b>5</b><span>members to call first</span></div></div>
  </section>
  <div class="kpis">
    <div class="kpi"><div class="ic o">${ico('clock')}</div><div><b>3</b><span>deadlines close this week (TRC Fri, FUH Wed, FMC Sat)</span></div></div>
    <div class="kpi"><div class="ic o">${ico('alert')}</div><div><b>2</b><span>unsafe medication conflicts (Dorothy, Margaret)</span></div></div>
    <div class="kpi"><div class="ic">${ico('phone')}</div><div><b>3</b><span>better phone numbers found in other sources</span></div></div>
    <div class="kpi"><div class="ic t">${ico('shield')}</div><div><b>${nSup}</b><span>alert suppressed by a guard (no false alarm)</span></div></div>
    <div class="kpi"><div class="ic t">${ico('check')}</div><div><b>0</b><span>systems to open: every fact is already here, with its source</span></div></div>
  </div>
  <div class="qwrap">
    <div class="card ${S.legacy ? 'legacy' : ''}" id="queue">
      <div class="hd"><span class="n">1</span><h3>Today's queue · ranked by who needs Maria first</h3><span class="sub">Score = clinical risk (1–5) × time window (1–3) × chance of reaching someone today (0.5–1)</span></div>
      <div class="legacyNote">${ico('alert')} <b>Today's worklist:</b> A–Z by last name, no reasons, no signals. Dorothy sits at #3 and Marcus at #9: his 7-day follow-up window closes Wednesday.</div>
      <div class="qhead"><span>#</span><span>Member</span><span>Priority</span><span>Why now</span><span>Signals</span><span>Next best action</span><span></span></div>
      ${rows}
    </div>
    <div class="stack">
      <div class="held" id="heldback"><h4>${ico('eyeoff')} Held back: not alerted</h4>
        ${sup.map(({ p, s }) => `<div style="font-size:12.5px"><b>${esc(p.name)} · ${esc(s.title)}</b><p style="margin:4px 0">${esc(s.reason)}</p>
          <div class="row" style="gap:4px">${s.evidence.map(e => recChip(e.rec, p.id)).join('')}${flaw('IMP-P5-02')}</div>
          <p class="note" style="margin-top:6px">${esc(s.instead)} A false alarm here would teach Maria to ignore refill alerts.</p></div>`).join('')}
      </div>
      <div class="card"><div class="hd"><h3>Maria's overrides</h3><span class="sub">feed weekly rule review</span></div>
        <div class="bd">${S.log.length ? `<ul class="log">${S.log.map(l => `<li><b>${l.at}</b> ${esc(l.text)}<br><span class="dim">Reason: ${esc(l.reason)}</span></li>`).join('')}</ul>`
          : `<p class="note" style="margin:0">Use ▲▼ to re-order. The workbench asks why, so the clinical team can tune the rules instead of Maria silently working around them.</p>`}</div></div>
      <div class="card"><div class="hd"><h3>What's in this queue</h3></div><div class="bd note">
        Ranks 1–5 are the five deck patients (one scenario each). Ranks 6–10 are supporting members with no signal, there to show the queue also says who <b>can wait</b>. Henry (#10) is on the same heart medicine as Dorothy, filled on time: the contrast case.</div></div>
    </div>
  </div>`;
}

/* -------------------------------------------------------------------- MEMBER 360 */
function ptabs(route) {
  return `<div class="ptabs">${S.order.map(id => { const p = P(id);
    return `<button class="ptab ${id === S.pid ? 'on' : ''} ${p.hero ? '' : 'rt'}" data-act="pick" data-id="${id}" data-route="${route}"><i>${p.rank}</i>${esc(p.name)}</button>`; }).join('')}</div>`;
}
function header(p) {
  const lang = p.languageFlag ? `<b style="color:var(--odark)">${esc(p.language)}</b>` : `<b>${esc(p.language)}</b>`;
  return `<div class="mhead"><div class="avatar">${initials(p)}</div>
    <div><h2>${esc(p.name)} <span class="chip">${p.age} ${p.sex}</span><span class="chip">${esc(p.plan)}</span>${p.hero ? `<span class="chip n">Deck patient ${p.id}</span>` : '<span class="chip g">Supporting</span>'}</h2>
      <div class="meta"><span>Program <b>${esc(p.program)}</b></span><span>PCP <b>${esc(p.pcp)}</b></span><span>Language ${lang}</span><span>Authorised rep <b>${esc(p.authRep)}</b></span><span>ID <b>${p.member}</b></span></div></div>
    <div class="scorebox" title="Clinical risk × time window × reachability"><b>${p.score.toFixed(1)}</b><span>${p.risk} × ${p.window} × ${p.reach}</span><div class="note">#${p.rank} of 48 today</div></div></div>
    <div class="nbabar"><span class="lbl">Next best action</span><div>${esc(p.nba)}</div>
      <button class="btn sm orange" data-act="nav" data-route="prep">${ico('phone')}Prep the call</button></div>`;
}
function alerts(p) {
  const a = [];
  if (p.identity) {
    const st = S.idMatch[p.id], m = p.identity;
    a.push(`<div class="alert ${st === 'confirmed' ? 't' : 'o'}" id="idbanner">${ico(st === 'confirmed' ? 'check' : 'link')}
      <div class="tx"><b>${st === 'confirmed' ? 'Identity match confirmed by Maria: 3 records linked' : `Possible match: "${esc(m.name)}" at ${esc(m.facility)}, MRN ${esc(m.rec)} · confidence ${m.confidence}`}</b>
      <small>${m.matchOn.map(esc).join(' · ')} · ${m.records.map(r => recChip(r, p.id)).join('')} ${flaw('IMP-P3-01')}</small>
      <small>Never auto-merged below 0.95: a wrong merge puts someone else's history in this chart.</small></div>
      ${st ? '' : `<button class="btn sm teal" data-act="idm" data-v="confirmed">Same person</button><button class="btn sm" data-act="idm" data-v="rejected">Not her</button>`}</div>`);
  }
  if (p.utr) a.push(`<div class="alert ${S.utr[p.id] ? 't' : 'o'}">${ico('clock')}<div class="tx"><b>${S.utr[p.id] ? 'Auto-closure paused: a new number was found' : 'Case will auto-close as "unable to reach" tomorrow'}</b><small>${esc(p.utr.text)} ${recChip(p.utr.rec, p.id)} ${flaw('IMP-P3-05')}</small></div>
    ${S.utr[p.id] ? '' : `<button class="btn sm teal" data-act="utr">Pause closure</button>`}</div>`);
  if (p.fuh) {
    const days = ['Wed 4', 'Thu 5', 'Fri 6', 'Sat 7', 'Sun 8', 'Mon 9', 'Tue 10', 'Wed 11'];
    a.push(`<div class="alert o" id="fuh">${ico('clock')}<div class="tx"><b>7-day follow-up after psychiatric discharge (HEDIS FUH): window closes ${esc(p.fuh.closes)}, nothing booked</b>
      <small>Verified open slot: ${esc(p.fuh.slot)} ${recChip('DIR-0004', p.id)} ${flaw('IMP-P4-04')}</small></div>
      <div class="countdown">${days.map((d, i) => `<span class="${i < 5 ? 'past' : i === 5 ? 'today' : i === 7 ? 'end' : ''}" title="${d} Nov">${d.split(' ')[1]}</span>`).join('')}</div></div>`);
  }
  if (p.consentGate) a.push(`<div class="locked" id="consent">${ico('lock')}<div><b style="color:var(--navy)">Consent-gated record (42 CFR Part 2)</b><br>${esc(p.consentGate.text)} ${esc(p.consentGate.action)} ${flaw('IMP-P4-03')}</div></div>`);
  return a.length ? `<div class="alerts">${a.join('')}</div>` : '';
}
function signalCard(p, s) {
  const k = `${p.id}:${s.code}`, st = S.sig[k];
  const urgent = ['S1', 'S3'].includes(s.code) && s.confidence.startsWith('High');
  const ai = s.mode.startsWith('AI');
  return `<div class="scard ${urgent ? 'urgent' : ''} ${st?.state === 'confirmed' ? 'ok' : ''} ${st?.state === 'dismissed' ? 'no' : ''}" id="sig-${s.code}">
    <div class="top1"><span class="sig ${urgent ? 'o' : ''}">${s.code}</span><h4>${esc(s.title)}</h4>
      ${ai ? `<span class="ai-tag">${ico('spark')}AI flag</span>` : `<span class="chip">Rule</span>`}<span class="chip ${s.confidence.startsWith('High') ? 't' : ''}">${esc(s.confidence)}</span></div>
    <div class="rule"><b>Why it fired:</b> ${esc(s.rule)}</div>
    <ul class="ev">${s.evidence.map(e => `<li><span>${recChip(e.rec, p.id)}</span>${srcChip(e.src)}<span>${esc(e.text)}</span></li>`).join('')}</ul>
    ${s.guards.length ? `<div class="guards"><span class="note" style="width:100%">Checked before alerting:</span>${s.guards.map(g => `<span class="chip t">${ico('check')}${esc(g)}</span>`).join('')}</div>` : ''}
    <div class="acts">${s.actions.map((t, i) => `<label><input type="checkbox" data-act="actck" data-k="${k}:${i}" ${S.acts[`${k}:${i}`] ? 'checked' : ''}>${esc(t)}</label>`).join('')}</div>
    <div class="sfoot">${st ? `<span class="${st.state === 'confirmed' ? 'ok-tag' : 'chip g'}">${st.state === 'confirmed' ? ico('check') + 'Confirmed' : 'Dismissed'} by Maria ${st.at}${st.reason ? ' · ' + esc(st.reason) : ''}</span><button class="btn sm ghost" data-act="sigundo" data-k="${k}">Undo</button>`
      : `<button class="btn sm teal" data-act="sigok" data-k="${k}">${ico('check')}Confirm</button><button class="btn sm" data-act="signo" data-k="${k}">Dismiss…</button>`}
      <span class="meas">${esc(s.mode)}<br>Measure: ${esc(s.measure)}</span></div></div>`;
}
function conflicts(p) {
  if (!p.conflicts.length) return '';
  return `<div class="card" id="conflicts"><div class="hd"><span class="n">2</span><h3>Where sources disagree</h3><span class="sub">shown side by side; Maria decides</span></div><div class="bd">
    ${p.conflicts.map(c => { const done = S.conf[`${p.id}:${c.topic}`] || c.severity === 'Resolved';
      return `<div class="conf"><div class="side2">${srcChip(c.a.src)} ${c.a.rec !== c.a.src ? recChip(c.a.rec, p.id) : ""}<div class="v">${esc(c.a.value)}</div><span class="note">${esc(c.a.at)}</span></div>
        <div class="vs">VS</div><div class="side2">${srcChip(c.b.src)} ${c.b.rec !== c.b.src ? recChip(c.b.rec, p.id) : ""}<div class="v">${esc(c.b.value)}</div><span class="note">${esc(c.b.at)}</span></div>
        <div class="cn"><span class="sev ${done ? 'Resolved' : c.severity}">${done ? 'Resolved' : c.severity}</span><b style="color:var(--ink)">${esc(c.topic)}</b> ${esc(c.note)}
          ${done ? '' : `<button class="btn sm" style="margin-left:auto" data-act="confok" data-k="${esc(c.topic)}">Mark reconciled</button>`}</div></div>`; }).join('')}
  </div></div>`;
}
function medsCard(p) {
  return `<div class="card"><div class="hd"><span class="n">3</span><h3>Medication reconciliation</h3><span class="sub">clinical list vs. what the pharmacy actually dispensed</span></div><div class="bd" style="padding:0">
    <table class="t"><tr><th>Medication</th><th>Clinical plan</th><th>Pharmacy</th><th>Status</th></tr>
    ${p.meds.map(m => { const bad = !/^OK/.test(m.status); return `<tr><td><b>${esc(m.name)}</b><br>${recChip(m.rec, p.id)}</td><td>${esc(m.clinical)}</td><td>${esc(m.pharmacy)}</td><td class="st ${bad ? 'bad' : 'good'}">${esc(m.status)}</td></tr>`; }).join('')}</table></div></div>`;
}
function missingCard(p) {
  const labs = p.labs.length ? `<table class="t" style="margin-top:8px"><tr><th>Lab</th><th>Result</th><th>Date</th><th></th></tr>${p.labs.map(l => `<tr><td>${esc(l.test)} ${recChip(l.rec, p.id)}</td><td><b>${esc(l.value)}</b> ${l.flag ? `<span class="chip o">${l.flag}</span>` : ''}</td><td>${esc(l.at)}</td><td class="note">${esc(l.note)}</td></tr>`).join('')}</table>` : '';
  if (!p.missing.length && !p.labs.length && !p.gaps.length) return '';
  return `<div class="card"><div class="hd"><span class="n">4</span><h3>Expected but missing · labs · open gaps</h3></div><div class="bd">
    ${p.missing.map(m => `<div class="row" style="justify-content:space-between;border-bottom:1px dashed var(--line);padding:5px 0;font-size:12.5px"><span><b>${esc(m.what)}</b><br><span class="dim">Expected: ${esc(m.expected)}</span></span><span class="chip">${esc(m.action)}</span></div>`).join('')}
    ${labs}
    ${p.gaps.length ? `<div class="row" style="margin-top:8px;gap:5px"><span class="note">Quality gaps:</span>${p.gaps.map(g => `<span class="chip o">${esc(g)}</span>`).join('')}</div>` : ''}</div></div>`;
}
function timeline(p) {
  const items = [...p.timeline].sort((a, b) => a.at.localeCompare(b.at));
  return `<div class="card" id="timeline"><div class="hd"><span class="n">5</span><h3>Timeline: every event, with when it reached us</h3><span class="sub">dashed = expected, not yet received</span></div><div class="bd">
    <ul class="tl">${items.map(t => `<li class="${t.visible ? '' : 'future'}" data-rec="${t.rec}"><span class="dt">${fmtDate(t.at)}</span><span class="dot"></span>${srcChip(t.src)}
      <span>${esc(t.text)} ${recChip(t.rec, p.id)} ${flaw(t.flag)}<span class="rcv">Received: ${esc(t.received)}</span></span></li>`).join('')}</ul>
    <div style="margin-top:10px"><div class="note" style="margin-bottom:5px">Data freshness for this member</div><div class="fresh">${p.sources.map(([s, d]) => `<div><b>${esc(s)}</b>${esc(d)}</div>`).join('')}</div></div></div></div>`;
}
function member() {
  const p = P(S.pid);
  const sigs = p.signals.length ? p.signals.map(s => signalCard(p, s)).join('')
    : `<div class="empty">${ico('check')} No signal fired for ${esc(first(p))}. ${esc(p.why.join(' · '))}.<br>The queue shows her/him so Maria knows this member <b>can wait</b>.</div>`;
  const sup = p.suppressed.map(s => `<div class="held" style="margin-bottom:12px"><h4>${ico('eyeoff')}${s.code} ${esc(s.title)}: held back</h4><p style="margin:3px 0;font-size:12.5px">${esc(s.reason)}</p><div class="row" style="gap:4px">${s.evidence.map(e => recChip(e.rec, p.id)).join('')}${flaw('IMP-P5-02')}</div></div>`).join('');
  return `${ptabs('member')}${header(p)}${alerts(p)}
  <div class="grid2" style="margin-top:12px">
    <div><div class="row" style="margin-bottom:8px"><span class="n" style="width:22px;height:22px;border-radius:7px;background:var(--orange);display:grid;place-items:center;font-weight:800;font-size:11.5px">1</span><h3 style="margin:0;font-size:15px">Signals: what changed and what to do</h3><span class="note">Each one cites its records. Click an ID.</span></div>${sigs}${sup}</div>
    <div class="stack">${conflicts(p)}${medsCard(p)}${missingCard(p)}</div>
  </div>
  <div style="margin-top:14px">${timeline(p)}</div>`;
}

/* -------------------------------------------------------------------- CALL PREP */
function aiMeta(r) {
  if (!r) return '';
  if (r.source === 'gemini') return `<div class="meta-ai"><span class="ai-tag">${ico('spark')}Live AI draft · ${esc(r.model)}</span><span>${(r.latencyMs / 1000).toFixed(1)} s</span><span>Every line validated against this member's record IDs on the server.</span></div>`;
  return `<div class="meta-ai"><span class="ai-tag" style="background:#EEF1F6;color:var(--dim)">${ico('spark')}Pre-generated draft</span><span title="${esc(r.reason)}">Live AI unavailable (${esc(String(r.reason || '').split(':')[0].slice(0, 60))}); same validation rules.</span></div>`;
}
function prep() {
  const p = P(S.pid);
  const cs = [...p.contacts].sort((a, b) => a.rank - b.rank);
  const textable = cs.find(c => c.textConsent === 'Yes' && !/Locked/.test(c.status));
  const br = S.ai['brief:' + p.id];
  let brief;
  if (!br) brief = `<div class="empty">${ico('spark')} One click turns ${p.recordIds.length} records into a 30-second brief.<br>The model may only use this member's records; any line without a valid record ID is thrown out.<div style="margin-top:10px"><button class="btn orange" data-act="ai" data-mode="brief">${ico('spark')}Generate call brief</button></div></div>`;
  else if (br.loading) brief = `<div class="empty"><span class="spinner"></span> Reading ${p.recordIds.length} records…</div>`;
  else if (!br.result) brief = `<div class="empty">${esc(first(p))} is a routine member: no brief needed today. ${esc(br.reason || '')}</div>`;
  else brief = `${aiMeta(br)}<ul class="brief">${br.result.lines.map((l, i) => `<li><span class="k">${i + 1}</span><span>${esc(l.text)} ${l.cites.map(c => recChip(c, p.id)).join('')}</span></li>`).join('')}</ul>
    <div style="margin-top:10px"><b style="font-size:13px">Ask on the call</b><ol class="qs">${br.result.questions.map(q => `<li>${esc(q)}</li>`).join('')}</ol></div>
    ${br.dropped?.length ? `<div class="dropped">${ico('shield')} ${br.dropped.length} AI line(s) removed by the validator (no valid record citation).</div>` : ''}
    <div class="row" style="margin-top:10px"><span class="note">AI draft: Maria checks it against the chart. Nothing is saved.</span><button class="btn sm" style="margin-left:auto" data-act="ai" data-mode="brief">Regenerate</button></div>`;
  const allActs = p.signals.flatMap(s => s.actions.slice(0, 2).map(a => ({ s: s.code, a })));
  return `${ptabs('prep')}${header(p)}
  <div class="grid2" style="margin-top:12px">
    <div class="stack">
      <div class="card" id="contacts"><div class="hd"><span class="n">1</span><h3>Who to call, and when</h3><span class="sub">ranked by last success, freshness and consent</span></div><div class="bd">
        ${cs.map((c, i) => { const dead = /Disconnected|Locked/.test(c.status);
          return `<div class="contact ${i === 0 ? 'best' : ''} ${dead ? 'dead' : ''}"><span class="rk">${i + 1}</span>
          <div><div class="num">${esc(c.number)} <span class="chip">${esc(c.type)}</span> ${/Locked/.test(c.status) ? `<span class="chip g">${ico('lock')}Locked</span>` : ''}</div>
            <div class="mt">${esc(c.owner)} · best <b>${esc(c.bestTime)}</b> · texts: <b>${esc(c.textConsent)}</b></div>
            <div class="mt">${srcChip(c.source)} updated ${esc(fmtDate(c.updated))} · last reached ${c.lastSuccess ? esc(fmtDate(c.lastSuccess)) : 'never'} · <b>${esc(c.status)}</b> ${recChip(c.id, p.id)}</div>
            ${c.note ? `<div class="mt" style="font-style:italic">${esc(c.note)}</div>` : ''}</div>
          ${dead ? '' : `<button class="btn sm ${i === 0 ? 'teal' : ''}" data-act="call" data-n="${esc(c.number)}">${ico('phone')}Call</button>`}</div>`; }).join('')}
        ${p.id === 'P3' ? flaw('IMP-P3-02') : ''}${p.id === 'P4' ? flaw('IMP-P4-02') : ''}</div></div>
      <div class="card"><div class="hd"><span class="n">2</span><h3>If no answer: one-tap callback text</h3><span class="sub">no health details in texts</span></div><div class="bd">
        ${textable ? `<div class="sms"><div class="note" style="margin-bottom:6px">To ${esc(textable.number)} (${esc(textable.owner)}) · consent on file</div>
          <div class="bubble">Hi ${esc(textable.owner.split(' ')[0].replace(/[(),]/g, ''))}, this is Maria, a nurse with your health plan. Please call me back at (312) 555-0100, or reply with a good time to talk. Reply STOP to opt out.</div>
          <div class="row" style="margin-top:8px"><button class="btn sm" data-act="sms">${ico('msg')}Queue text</button><span class="note">Template only. AI never writes to members.</span></div></div>`
          : `<div class="locked">${ico('lock')}<div>No text consent on file for any working number. <b>Ask for consent on the first call</b>, then this unlocks.</div></div>`}
      </div></div>
      ${allActs.length ? `<div class="card"><div class="hd"><span class="n">3</span><h3>Call plan</h3><span class="sub">from the confirmed signals</span></div><div class="bd acts" style="margin:0;border:0">${allActs.map(x => `<label><input type="checkbox"><span><span class="sig" style="height:18px;min-width:24px;font-size:10px">${x.s}</span> ${esc(x.a)}</span></label>`).join('')}</div></div>` : ''}
    </div>
    <div class="card" id="aibrief"><div class="hd"><span class="n">4</span><h3>30-second call brief</h3><span class="ai-tag" style="margin-left:auto">${ico('spark')}AI draft · Maria verifies</span></div><div class="bd">${brief}</div>
      <div class="bd" style="border-top:1px solid var(--line)"><button class="btn primary" data-act="nav" data-route="doc">${ico('file')}After the call: document it ${ico('arrow')}</button></div></div>
  </div>`;
}

/* -------------------------------------------------------------------- DOCUMENT */
function doc() {
  const p = P(S.pid);
  if (!p.hero) return `${ptabs('doc')}${header(p)}<div class="empty" style="margin-top:14px">No call planned for ${esc(p.name)} today. Pick one of the five deck patients to see the note flow.</div>`;
  const tx = S.tx[p.id] ?? p.transcript;
  const r = S.ai['note:' + p.id], rev = S.rev[p.id] || {}, ed = S.edit[p.id] || {};
  let right;
  if (S.signed[p.id]) {
    const n = r.result;
    right = `<div class="alert t">${ico('check')}<div class="tx"><b>Signed by Maria R., RN at ${S.signed[p.id]}. Entered once, updated 5 places.</b><small>No re-typing into the case system, the quality tracker and the task list.</small></div></div>
      <div class="fanout">
        <div><b>Case note</b>${n.fields.length} structured fields + summary</div>
        <div><b>Quality evidence</b>${esc(p.gaps[0] ? p.gaps[0].split(':')[0] : 'Care plan')} documentation attached</div>
        <div><b>Tasks</b>${n.tasks.length} created with owners and due dates</div>
        <div><b>Contact record</b>Best number, time and consent updated</div>
        <div><b>Care team</b>Message to ${esc(p.pcp)} queued for review</div></div>
      <table class="t" style="margin-top:12px"><tr><th>Task</th><th>Owner</th><th>Due</th></tr>${n.tasks.map(t => `<tr><td>${esc(t.task)}</td><td>${esc(t.owner)}</td><td>${esc(t.due)}</td></tr>`).join('')}</table>
      <div class="row" style="margin-top:12px"><button class="btn" data-act="unsign">Reopen draft</button><button class="btn primary" data-act="nextpt">${ico('arrow')}Next member in queue</button></div>`;
  } else if (!r) right = `<div class="empty">${ico('spark')} Paste or edit the call transcript, then draft.<br>The AI fills the note fields and tasks; each field shows where it came from.<div style="margin-top:10px"><button class="btn orange" data-act="ai" data-mode="note">${ico('spark')}Draft note from call</button></div></div>`;
  else if (r.loading) right = `<div class="empty"><span class="spinner"></span> Drafting the note…</div>`;
  else {
    const n = r.result, total = n.fields.length, done = n.fields.filter((_, i) => rev[i]).length;
    right = `${aiMeta(r)}<div class="field" style="background:var(--bsoft2)"><div class="fh">Summary</div><div style="font-size:13px;margin-top:3px">${esc(n.summary)}</div></div>
      ${n.fields.map((f, i) => `<div class="field ${rev[i] ? 'rv' : ''}"><div class="fh">${esc(f.label)}<label><input type="checkbox" data-act="rev" data-i="${i}" ${rev[i] ? 'checked' : ''}>Reviewed</label></div>
        <textarea rows="${Math.max(1, Math.ceil(String(ed[i] ?? f.value).length / 78))}" data-edit="${i}">${esc(ed[i] ?? f.value)}</textarea>
        <div class="fs">Source: ${f.source.split('·').map(s => s.trim()).map(s => s === 'call' ? '<span class="chip g">call</span>' : recChip(s, p.id)).join(' ')}</div></div>`).join('')}
      ${r.dropped?.length ? `<div class="dropped">${ico('shield')} ${r.dropped.length} field(s) removed: source not in the record or the call.</div>` : ''}
      <div style="margin-top:8px"><b style="font-size:13px">Follow-up tasks</b><table class="t" style="margin-top:4px"><tr><th>Task</th><th>Owner</th><th>Due</th></tr>${n.tasks.map(t => `<tr><td>${esc(t.task)}</td><td>${esc(t.owner)}</td><td>${esc(t.due)}</td></tr>`).join('')}</table></div>
      <div class="signbar"><div class="prog"><b>${done} of ${total} fields reviewed</b><div class="pb"><i style="width:${done / total * 100}%"></i></div></div>
        <button class="btn sm" style="background:transparent;color:#fff;border-color:#ffffff40" data-act="revall">Review all</button>
        <button class="btn orange" data-act="sign" ${done < total ? 'disabled' : ''}>${ico('check')}Sign note</button></div>
      <p class="note" style="margin-top:6px">Sign stays locked until every field is reviewed. The draft is not saved anywhere until Maria signs.</p>`;
  }
  return `${ptabs('doc')}${header(p)}
  <div class="grid2" style="margin-top:12px">
    <div class="card"><div class="hd"><span class="n">1</span><h3>Call transcript</h3><span class="sub">synthetic · recorded with consent · editable</span></div><div class="bd">
      <textarea id="transcript" rows="22" data-tx="${p.id}">${esc(tx)}</textarea>
      <div class="row" style="margin-top:8px"><button class="btn orange" data-act="ai" data-mode="note">${ico('spark')}${r ? 'Re-draft from transcript' : 'Draft note from call'}</button><span class="note">Try editing a line (e.g. a weight) and re-drafting.</span></div></div></div>
    <div class="card" id="docpanel"><div class="hd"><span class="n">2</span><h3>Draft note → review → sign once</h3><span class="ai-tag" style="margin-left:auto">${ico('spark')}AI draft, not saved until Maria signs</span></div><div class="bd">${right}</div></div>
  </div>`;
}

/* -------------------------------------------------------------------- HOW IT WORKS */
function how() {
  const fl = S.data.flaws.filter(f => S.flawFilter === 'all' || f.patient === S.flawFilter);
  const h = S.health;
  return `<div class="card" style="margin-bottom:14px"><div class="hd"><span class="n">1</span><h3>From raw feeds to Maria's decision</h3><span class="sub">automate the finding, keep the judging human</span></div><div class="bd">
    <div class="pipe">
      <div><b>1 · Ingest</b><span>13 payer feeds land at their own speed: ADT in minutes, claims in 30–90 days.</span><br><em>AUTOMATED</em></div>
      <div><b>2 · Match</b><span>Link records to the member. Below 0.95 confidence a human confirms (Keisha).</span><br><em>AUTOMATED</em></div>
      <div><b>3 · Detect</b><span>8 plain-English rules (S1–S8), each with guards that stop false alarms.</span><br><em>AUTOMATED</em></div>
      <div><b>4 · Rank</b><span>Risk × window × reach. Transparent, so Maria can argue with it.</span><br><em>AUTOMATED</em></div>
      <div class="ai"><b>5 · Draft</b><span>Gemini writes the call brief and the note. Cited or deleted.</span><br><em>AI SUGGESTS</em></div>
      <div class="hu"><b>6 · Decide</b><span>Maria confirms, dismisses, re-orders, signs. Her reasons tune the rules weekly.</span><br><em>MARIA DECIDES</em></div>
    </div></div></div>
  <div class="grid2">
    <div class="stack">
      <div class="card"><div class="hd"><span class="n">2</span><h3>Priority score</h3></div><div class="bd">
        <div class="formulaBig"><div class="f"><b>Clinical risk 1–5</b><span>How bad if we miss it (fresh HF discharge = 5)</span></div><span class="op">×</span>
          <div class="f"><b>Time window 1–3</b><span>Deadline ≤3 days = 3 (TRC, FUH, PA clocks)</span></div><span class="op">×</span>
          <div class="f"><b>Reachability 0.5–1</b><span>Chance of reaching someone today</span></div></div>
        <p class="note" style="margin-top:10px">Dorothy: 5 × 3 × 0.8 = <b>12.0</b> (#1). Marcus: 4 × 3 × 0.65 = 7.8. Reachability lowers a score but never removes a member: Keisha's 0.6 still puts her above routine members.</p></div></div>
      <div class="card"><div class="hd"><span class="n">3</span><h3>Five trust rules</h3></div><div class="bd"><ol class="rules" style="margin:0;padding-left:18px">
        <li><b>Every fact shows its source and date.</b> No source, no display.</li>
        <li><b>Newer clinical truth beats older admin truth</b>, and the conflict stays visible.</li>
        <li><b>Missing is not the same as "didn't happen".</b> Claims lag; the timeline shows what is expected.</li>
        <li><b>Guards before alarms.</b> Mail order, SNF transfer and disenrollment are checked first.</li>
        <li><b>Consent gates content, not existence.</b> Part 2 records are shown as locked.</li></ol></div></div>
      <div class="card"><div class="hd"><span class="n">4</span><h3>What the AI does, and doesn't</h3></div><div class="bd" style="padding:0"><table class="t">
        <tr><th>AI does (drafts)</th><th>AI never does</th></tr>
        <tr><td>30-second call brief from this member's records</td><td>Rank the queue or fire alerts (rules do, so they're auditable)</td></tr>
        <tr><td>Case note fields + tasks from the call transcript</td><td>Save anything without Maria's signature</td></tr>
        <tr><td>Flag caregiver strain in free-text notes (S8)</td><td>Text or call members; read consent-gated content</td></tr></table>
        <div class="note" style="padding:10px 14px">Server-side: the key stays in an environment variable; temperature 0.1; JSON schema; any line citing an ID not in this member's record is removed; on any failure a pre-generated draft is shown. ${h ? (h.keyConfigured ? `<span class="ok-tag">${ico('check')}AI key configured on server</span>` : '<span class="chip g">AI key not configured: pre-generated drafts</span>') : ''}</div></div></div>
    </div>
    <div class="card" id="flaws"><div class="hd"><span class="n">5</span><h3>24 planted data flaws and how each was handled</h3><span class="sub">same IDs as the Excel annex</span></div><div class="bd">
      <div class="filters">${['all', 'P1', 'P2', 'P3', 'P4', 'P5'].map(f => `<button class="btn sm ${S.flawFilter === f ? 'primary' : ''}" data-act="ff" data-f="${f}">${f === 'all' ? 'All 24' : P(f).name.split(' ')[0]}</button>`).join('')}</div>
      <table class="t"><tr><th>ID</th><th>Flaw in the data</th><th>How the workbench handled it</th></tr>
      ${fl.map(f => `<tr><td><span class="flaw" style="display:inline-flex">${f.id}</span></td><td>${esc(f.flaw)}</td><td><span class="st good">${esc(f.handled)}</span></td></tr>`).join('')}</table>
      <p class="note" style="margin-top:8px">Turn on <b>Show planted flaws</b> (top bar) to see each flaw tagged where it appears in the screens.</p></div></div>
  </div>
  <div class="card" style="margin-top:14px"><div class="hd"><span class="n">6</span><h3>Data freshness at 08:00 Monday</h3><span class="sub">why claims alone would have missed every one of the top 5</span></div><div class="bd"><div class="fresh">
    ${S.data.feeds.map(([s, d, lag]) => `<div><b>${s}</b>last ${esc(d)} · <span class="dim">${esc(lag)}</span></div>`).join('')}</div></div></div>`;
}

/* -------------------------------------------------------------------- records popover */
function recIndex(p) {
  const m = {};
  const add = (rec, src, text, at) => { if (!rec) return; (m[rec] ||= []); if (!m[rec].some(x => x.text === text)) m[rec].push({ src, text, at }); };
  p.signals.forEach(s => s.evidence.forEach(e => add(e.rec, e.src, e.text)));
  p.suppressed.forEach(s => s.evidence.forEach(e => add(e.rec, e.src, e.text)));
  p.timeline.forEach(t => add(t.rec, t.src, t.text + (t.visible ? '' : ' (not yet received)'), t.at));
  p.meds.forEach(x => add(x.rec, 'RX', `${x.name}: ${x.pharmacy} (${x.status})`));
  p.labs.forEach(x => add(x.rec, 'LAB', `${x.test} ${x.value} ${x.flag}, ${x.at}`));
  p.contacts.forEach(c => add(c.id, 'CON', `${c.number} · ${c.owner} · ${c.status}`));
  p.conflicts.forEach(c => { add(c.a.rec, c.a.src, `${c.topic}: ${c.a.value}`); add(c.b.rec, c.b.src, `${c.topic}: ${c.b.value}`); });
  if (p.identity) p.identity.records.forEach(r => add(r, 'ADT', `Filed under ${p.identity.name}, MRN ${p.identity.rec}`));
  if (p.consentGate) add(p.consentGate.rec, 'BH', 'Content hidden: no Part 2 consent on file');
  if (p.utr) add(p.utr.rec, 'CASE', p.utr.text);
  [p.cachedBrief, null].forEach(b => b && b.lines.forEach(l => l.cites.forEach(c => { if (!m[c]) add(c, c.split('-')[0], l.text); })));
  return m;
}
function showPop(el, rec, pid) {
  const p = P(pid), items = recIndex(p)[rec];
  const pre = rec.split('-')[0];
  const srcName = { CP: 'Contact point', CN: 'Case note', AT: 'Outreach attempt', SD: 'Social-needs screen', CB: 'Community benefit', DIR: 'Provider directory', IMP: 'Planted flaw' }[pre] || SRC[pre] || 'Record';
  const pop = $('#pop');
  pop.innerHTML = `<h5><span class="rec static">${esc(rec)}</span>${esc(srcName)} · ${esc(p.name)}</h5>
    ${items ? items.map(i => `<p>${i.src ? srcChip(i.src) + ' ' : ''}${esc(i.text)}${i.at ? ` <span class="dim">(${esc(fmtDate(i.at))})</span>` : ''}</p>`).join('') : `<p class="dim">In the Excel annex, tab ${esc(pre)}.</p>`}
    <p class="note">Same ID in the Excel annex (HiLabs_Synthetic_Patients_Annex.xlsx).</p>`;
  pop.hidden = false;
  const r = el.getBoundingClientRect(), w = pop.offsetWidth, hgt = pop.offsetHeight;
  let x = Math.min(window.innerWidth - w - 12, Math.max(12, r.left)), y = r.bottom + 6;
  if (y + hgt > window.innerHeight - 10) y = r.top - hgt - 6;
  pop.style.left = x + 'px'; pop.style.top = y + 'px';
  document.querySelectorAll('.tl li.hl').forEach(n => n.classList.remove('hl'));
  const li = document.querySelector(`.tl li[data-rec="${CSS.escape(rec)}"]`); if (li) li.classList.add('hl');
}
function hidePop() { const p = $('#pop'); if (p) p.hidden = true; }

/* -------------------------------------------------------------------- modals */
function modal(html) { const m = $('#modal'); m.innerHTML = `<div class="box">${html}</div>`; m.hidden = false; }
function closeModal() { $('#modal').hidden = true; }
function welcome() {
  modal(`<div class="mh"><div class="eyebrow">HiLabs APM case study · working prototype</div><h2>Reimagining the case-management workbench</h2>
    <p style="margin:4px 0 0;color:#D7E1F5;font-size:13.5px">It is Monday 08:00. You are <b style="color:#fff">Maria, an RN case manager</b> with 48 members. The workbench has already read the weekend's feeds. Your job: decide who to call first, and what to do on the call.</p></div>
    <div class="mb"><div class="welcome-grid">
      <div><b>${ico('list')}Today</b>A ranked queue with the maths and the reason for every rank.</div>
      <div><b>${ico('user')}Member 360</b>Signals that cite their records; conflicts side by side.</div>
      <div><b>${ico('phone')}Call prep</b>Best number and time, plus a 30-second AI brief.</div>
      <div><b>${ico('file')}Document</b>Transcript → AI-drafted note → Maria reviews → sign once.</div></div>
      <p class="note">All 10 members and every record are synthetic (fictional 555-01xx numbers). The top 5 in the queue are the 5 patients in the deck and the Excel annex, with the same record IDs.</p></div>
    <div class="mf"><button class="btn" data-act="close">Explore on my own</button><button class="btn orange" data-act="tour-start">${ico('play')}Take the 5-minute tour</button></div>`);
}
function reasonModal(id, dir) {
  const p = P(id);
  modal(`<div class="mh"><h2>Why move ${esc(p.name)} ${dir < 0 ? 'up' : 'down'}?</h2><p style="margin:2px 0 0;color:#D7E1F5;font-size:13px">Your reason goes to the weekly rule review, so the ranking learns from you.</p></div>
    <div class="mb reasons">${['Clinical judgment: higher acuity than the score shows', 'Member asked for a specific time', 'Already handled outside the system', 'Waiting on another team today'].map((r, i) => `<label><input type="radio" name="rs" value="${esc(r)}" ${i === 0 ? 'checked' : ''}>${esc(r)}</label>`).join('')}</div>
    <div class="mf"><button class="btn" data-act="close">Cancel</button><button class="btn primary" data-act="move-ok" data-id="${id}" data-dir="${dir}">Move and log</button></div>`);
}
function dismissModal(k) {
  modal(`<div class="mh"><h2>Dismiss this signal?</h2><p style="margin:2px 0 0;color:#D7E1F5;font-size:13px">Dismissals with a reason are how the rules get fewer false alarms.</p></div>
    <div class="mb reasons">${['Already resolved (information the feeds don\'t have)', 'Data error in the source', 'Not clinically relevant for this member', 'Member declined'].map((r, i) => `<label><input type="radio" name="rs" value="${esc(r)}" ${i === 0 ? 'checked' : ''}>${esc(r)}</label>`).join('')}</div>
    <div class="mf"><button class="btn" data-act="close">Cancel</button><button class="btn primary" data-act="signo-ok" data-k="${k}">Dismiss and log</button></div>`);
}

/* -------------------------------------------------------------------- tour */
const TOUR = [
  { r: 'today', el: '#hello', t: 'Monday 08:00: the work is already sorted', x: 'Maria has 48 cases and time for only a handful of real calls. Instead of opening six systems, she starts here: the weekend\'s feeds have been read, checked and ranked.' },
  { r: 'today', el: '#q-P1', t: 'Why Dorothy is #1: the maths is visible', x: 'Clinical risk 5 × time window 3 × reachability 0.8 = 12.0. Her hospital claim won\'t arrive until ~4 Dec; the rank comes from the discharge feed, the discharge summary and a rejected pharmacy claim. Try ▲▼: it asks Maria why.' },
  { r: 'today', el: '#heldback', t: 'The alert that did NOT fire', x: 'Retail data says Margaret\'s blood thinner is 30 days overdue. A guard checked mail order: a 90-day box is in tomorrow\'s batch. Holding back false alarms is what makes Maria trust the real ones.' },
  { r: 'member', id: 'P1', el: '#sig-S3', t: 'An unsafe mix-up, with receipts', x: 'Lisinopril was stopped at discharge but auto-refilled Saturday, while the new Entresto was rejected for prior authorisation. Together they\'re dangerous. Click any record ID: every line traces back to the Excel annex.' },
  { r: 'member', id: 'P1', el: '#conflicts', t: 'Disagreements are shown, not hidden', x: 'Discharge summary vs. pharmacy, survey vs. case note. Each side shows source and date; the newer clinical fact is suggested, and Maria decides.' },
  { r: 'prep', id: 'P1', el: '#aibrief', t: 'AI that must cite or be cut', x: 'Click "Generate call brief". Gemini gets only Dorothy\'s records. The server deletes any line without a valid record ID. If the AI is down, a pre-generated draft appears, so the flow never breaks.' },
  { r: 'doc', id: 'P1', el: '#docpanel', t: 'Document once, not five times', x: 'Draft the note from the call transcript. Each field shows its source; "Sign" stays locked until Maria reviews every field. One signature updates the note, quality evidence, tasks, contacts and the PCP message.' },
  { r: 'member', id: 'P3', el: '#idbanner', t: 'Keisha: the unreachable member who wasn\'t', x: 'Her ED visit was filed under "KEYSHA", a new hospital ID (match 0.86). The workbench never auto-merges; Maria confirms. A new mobile from the pharmacy also stops her case from auto-closing tomorrow.' },
  { r: 'member', id: 'P4', el: '#fuh', t: 'Marcus: a clock, a shelter and a consent gate', x: 'The 7-day follow-up window closes Wednesday; a verified telehealth slot is offered. His substance-use record is shown as locked, and the shelter can\'t be called until he signs a release.' },
  { r: 'how', el: '#flaws', t: 'Depth: 24 planted flaws, all handled', x: 'Every flaw planted in the synthetic data, how the workbench handled it, same IDs as the annex. Flip "Show planted flaws" to see them tagged across the screens. That\'s the tour: explore freely.' },
];
function tourGo(i) {
  S.tour = i; closeModal();
  if (i < 0 || i >= TOUR.length) { S.tour = -1; $('#tour').hidden = true; document.querySelectorAll('.tour-hl').forEach(n => n.classList.remove('tour-hl')); return; }
  const s = TOUR[i];
  if (s.id) S.pid = s.id;
  const h = s.id ? `${s.r}/${s.id}` : s.r;
  if (location.hash.slice(1) !== h) location.hash = h; else render();
  const t = $('#tour');
  t.innerHTML = `<div class="st">Tour · ${i + 1} of ${TOUR.length}</div><h4>${esc(s.t)}</h4><p>${esc(s.x)}</p><div class="pb"><i style="width:${(i + 1) / TOUR.length * 100}%"></i></div>
    <div class="nav"><button class="btn sm" data-act="tour-end">End</button>${i ? `<button class="btn sm" data-act="tour-prev">Back</button>` : ''}<button class="btn sm orange" data-act="tour-next">${i === TOUR.length - 1 ? 'Finish' : 'Next'}</button></div>`;
  t.hidden = false;
}
function tourHighlight() {
  document.querySelectorAll('.tour-hl').forEach(n => n.classList.remove('tour-hl'));
  const el = $(TOUR[S.tour].el);
  if (el) { el.classList.add('tour-hl'); setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60); }
}

/* -------------------------------------------------------------------- AI */
async function runAI(mode) {
  const p = P(S.pid), key = `${mode}:${p.id}`;
  S.ai[key] = { loading: true };
  if (mode === 'note') { S.rev[p.id] = {}; S.edit[p.id] = {}; }
  render(true);
  const body = { mode, patientId: p.id };
  if (mode === 'note') body.transcript = S.tx[p.id] ?? p.transcript;
  try {
    const r = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    S.ai[key] = await r.json();
  } catch (e) {
    S.ai[key] = { source: 'cached', reason: 'offline: ' + e.message, result: mode === 'brief' ? p.cachedBrief : p.cachedNote, dropped: [] };
  }
  if (S.route === (mode === 'brief' ? 'prep' : 'doc') && S.pid === p.id) render(true);
}

/* -------------------------------------------------------------------- events */
function onInput(e) {
  const t = e.target;
  if (t.dataset.tx) S.tx[t.dataset.tx] = t.value;
  if (t.dataset.edit !== undefined) { (S.edit[S.pid] ||= {})[t.dataset.edit] = t.value; }
}
function onClick(e) {
  const t = e.target.closest('[data-act]');
  if (!t) { if (!e.target.closest('#pop')) hidePop(); if (e.target.id === 'modal') closeModal(); return; }
  const d = t.dataset, p = P(S.pid);
  const A = {
    rec: () => { e.stopPropagation(); showPop(t, d.rec, d.pid); },
    open: () => { S.pid = d.id; go('member', d.id); },
    pick: () => { S.pid = d.id; go(d.route, d.id); },
    nav: () => go(d.route, S.pid),
    legacy: () => { S.legacy = !S.legacy; render(true); },
    move: () => reasonModal(d.id, +d.dir),
    'move-ok': () => {
      const i = S.order.indexOf(d.id), j = i + +d.dir;
      if (j < 0 || j >= S.order.length) { closeModal(); return; }
      const other = P(S.order[j]);
      [S.order[i], S.order[j]] = [S.order[j], S.order[i]];
      const reason = ($('input[name=rs]:checked') || {}).value;
      S.log.unshift({ at: now(), text: `Moved ${P(d.id).name} ${+d.dir < 0 ? 'above' : 'below'} ${other.name}`, reason });
      closeModal(); render(true); toast('Re-ordered. Reason logged for the weekly rule review.');
    },
    close: closeModal,
    sigok: () => { S.sig[d.k] = { state: 'confirmed', at: now() }; render(true); toast('Signal confirmed. Its actions go into the call plan.'); },
    signo: () => dismissModal(d.k),
    'signo-ok': () => { S.sig[d.k] = { state: 'dismissed', at: now(), reason: ($('input[name=rs]:checked') || {}).value }; closeModal(); render(true); },
    sigundo: () => { delete S.sig[d.k]; render(true); },
    actck: () => { S.acts[d.k] = t.checked; },
    idm: () => { S.idMatch[p.id] = d.v; render(true); toast(d.v === 'confirmed' ? '3 hospital records linked to Keisha. ED count now 3.' : 'Kept separate. Records not shown in this chart.'); },
    utr: () => { S.utr[p.id] = true; render(true); toast('Auto-closure paused. Call the new mobile today.'); },
    confok: () => { S.conf[`${p.id}:${d.k}`] = true; render(true); },
    call: () => toast(`Demo: dialling ${d.n} (fictional number). After the call, open Document.`),
    sms: () => toast('Callback text queued for the 2-hour no-answer rule. No health details included.'),
    ai: () => runAI(d.mode),
    rev: () => { (S.rev[p.id] ||= {})[d.i] = t.checked; render(true); },
    revall: () => { const n = S.ai['note:' + p.id].result.fields.length; S.rev[p.id] = Object.fromEntries([...Array(n).keys()].map(i => [i, true])); render(true); },
    sign: () => { S.signed[p.id] = now(); render(true); toast('Signed. One entry, five places updated.'); },
    unsign: () => { delete S.signed[p.id]; render(true); },
    nextpt: () => { const i = S.order.indexOf(p.id); const nx = S.order[(i + 1) % 5]; S.pid = nx; go('member', nx); },
    ff: () => { S.flawFilter = d.f; render(true); },
    'tour-start': () => tourGo(0), 'tour-next': () => tourGo(S.tour + 1), 'tour-prev': () => tourGo(S.tour - 1), 'tour-end': () => tourGo(-1),
  };
  if (A[d.act]) { if (t.tagName !== 'INPUT') e.preventDefault(); A[d.act](); }
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal(); hidePop(); } if (S.tour >= 0 && e.key === 'ArrowRight') tourGo(S.tour + 1); if (S.tour >= 0 && e.key === 'ArrowLeft' && S.tour > 0) tourGo(S.tour - 1); });
init();
