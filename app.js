/* Care Workbench · concept prototype. Vanilla JS, no build, no storage: state lives in memory for the session. */
'use strict';
const S = {
  data: null, view: 'today', pid: 'P1', tab: 'alerts', step: 'prep',
  order: [], filter: 'all', legacy: false, log: [],
  sig: {}, open: {}, acts: {}, idMatch: {}, utr: {}, conf: {},
  ai: {}, tx: {}, qn: {}, chk: {}, rev: {}, edit: {}, signed: {}, start: {},
  tasks: [], tour: -1, menu: false, health: null, extra: {}, skip: {},
};
const RULE = { S1: 'New discharge medicine not picked up', S2: 'Follow-up visit or approval at risk', S3: 'Medicine lists disagree', S4: 'Refills lapsing while risk rises',
  S5: 'A better phone number exists', S6: 'ER used instead of a doctor', S7: 'Social need blocking care', S8: 'Carer under strain' };
const SRCN = { ADT: 'Hospital', RX: 'Pharmacy', HIE: 'Dr notes', LAB: 'Lab', UM: 'Approval', CLM: 'Claims', CON: 'Contact', CASE: 'Case note', DIR: 'Directory',
  SDOH: 'Social', BH: 'Mental health', RISK: 'Risk', ELIG: 'Enrolment', CBO: 'Community', 'PBM pharmacy profile': 'Pharmacy', call: 'Call' };
const SRCL = { ADT: 'Hospital admit / discharge alert', RX: 'Pharmacy claims', HIE: "Doctors' notes via health information exchange", LAB: 'Lab results', UM: 'Plan approvals',
  CLM: 'Medical claims', CON: 'Contact & call log', CASE: 'Case notes', DIR: 'Provider directory (verified)', SDOH: 'Social-needs survey', BH: 'Behavioral health (consent-gated)',
  RISK: 'Risk & quality engine', ELIG: 'Enrolment', CBO: 'Community partner' };
const $ = (s, r = document) => r.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ico = (n, c = '') => `<svg class="i ${c}"><use href="#i-${n}"/></svg>`;
const P = id => S.data.patients.find(p => p.id === id);
const first = p => p.name.split(' ')[0];
const ini = p => p.name.split(' ').map(w => w[0]).join('').slice(0, 2);
const heroes = () => S.data.patients.filter(p => p.hero);
const rec = (id, pid) => `<button class="rec" data-act="rec" data-rec="${esc(id)}" data-pid="${pid}">${esc(id)}</button>`;
const src = s => `<span class="src" title="${esc(SRCL[s] || s)}">${esc(SRCN[s] || s)}</span>`;
const flaw = id => id ? `<span class="flaw" title="Planted data flaw (demo)">${ico('alert')}${id}</span>` : '';
const clock = () => { const n = 3 + S.log.length + Object.keys(S.sig).length + S.tasks.length; return `08:${String(n % 60).padStart(2, '0')}`; };
const fdate = s => { if (!s) return ''; const d = new Date(s.length <= 10 ? s + 'T12:00' : s); if (isNaN(d)) return s;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + (s.length > 10 ? ' · ' + s.slice(11, 16) : ''); };
function toast(t) { const el = $('#toast'); el.innerHTML = ico('check') + esc(t); el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => el.hidden = true, 2600); }

/* ------------------------------------------------------------------ boot + routing */
async function init() {
  S.data = await (await fetch('data.json', { cache: 'no-store' })).json();
  S.order = S.data.patients.map(p => p.id);
  window.addEventListener('hashchange', route);
  document.addEventListener('click', onClick);
  document.addEventListener('input', onInput);
  document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'addi') { e.preventDefault(); $('[data-act=add]').click(); return; } if (e.key === 'Escape') { closeAll(); } if (S.tour >= 0 && e.key === 'ArrowRight') tourGo(S.tour + 1); if (S.tour > 0 && e.key === 'ArrowLeft') tourGo(S.tour - 1); });
  window.addEventListener('resize', placeSpot); window.addEventListener('scroll', placeSpot, { passive: true });
  route();
  fetch('/api/ai').then(r => r.json()).then(j => S.health = j).catch(() => S.health = { ok: false });
  if (!location.hash) setTimeout(() => showMenu(true), 700);
}
function route() {
  const [v, id, sub] = (location.hash.slice(1) || 'today').split('/');
  S.view = ['today', 'm', 'call', 'tasks', 'insights'].includes(v) ? v : 'today';
  if (id && P(id)) S.pid = id;
  if (S.view === 'm') S.tab = ['alerts', 'meds', 'timeline', 'contacts', 'notes'].includes(sub) ? sub : 'alerts';
  if (S.view === 'call') { S.step = ['prep', 'live', 'wrap'].includes(sub) ? sub : 'prep'; enterStep(); }
  render();
}
function go(h) { if (location.hash.slice(1) === h) render(); else location.hash = h; }
function render(keep) {
  const y = window.scrollY;
  document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === (['m', 'call'].includes(S.view) ? 'today' : S.view)));
  const open = S.tasks.filter(t => !t.done).length; const b = $('#taskBadge'); b.hidden = !open; b.textContent = open;
  $('#main').innerHTML = ({ today, m: member, call, tasks, insights })[S.view]();
  hidePop();
  window.scrollTo(0, keep ? y : 0);
  if (S.view === 'call' && S.step === 'live') tick();
  if (S.tour >= 0) setTimeout(spotOn, 60);
}

/* ------------------------------------------------------------------ TODAY */
function today() {
  const H = heroes(), nAlerts = H.reduce((a, p) => a + p.signals.length, 0), nHeld = H.reduce((a, p) => a + p.suppressed.length, 0);
  const nDue = S.data.patients.filter(p => /^Visit/.test(p.due)).length, nReach = S.data.patients.filter(p => p.reach <= 0.65).length;
  const F = { all: () => true, call: p => p.hero, due: p => /^Visit/.test(p.due), reach: p => p.reach <= 0.65 };
  let ids = S.legacy ? [...S.order].sort((a, b) => P(a).name.split(' ').pop().localeCompare(P(b).name.split(' ').pop())) : S.order;
  ids = ids.filter(id => F[S.filter](P(id)));
  let sepDone = false;
  const rows = ids.map((id, i) => {
    const p = P(id), rank = S.order.indexOf(id) + 1, routine = !p.hero && !S.legacy;
    let sep = '';
    if (routine && !sepDone && S.filter === 'all') { sepDone = true; sep = `<tr class="sep"><td colspan="8">On track · routine this week</td></tr>`; }
    const sc = p.score >= 7 ? 'hi' : p.score >= 3 ? 'md' : 'lo';
    return sep + `<tr class="row ${rank === 1 && !S.legacy ? 'first' : ''} ${routine ? 'routine' : ''}" id="q-${id}" data-act="open" data-id="${id}">
      <td style="width:44px"><span class="rank">${S.legacy ? i + 1 : rank}</span></td>
      <td class="who"><b>${esc(p.name)}</b><span>${p.age} · ${esc(p.plan.replace('Medicare Advantage', 'Medicare Adv.').replace(' managed care', ''))}</span></td>
      <td>${S.legacy ? '<span class="dim">—</span>' : `<button class="score ${sc}" data-act="score" data-id="${id}" title="Tap for the maths"><span class="dot">${ico('spark')}</span>${p.score.toFixed(1)}</button>`}</td>
      <td class="c-why">${S.legacy ? '' : `<div class="why">${p.why.slice(0, 2).map((w, k) => `<span class="chip ${k === 0 && p.hero ? 'o' : ''}">${esc(w)}</span>`).join('')}</div>`}</td>
      <td class="c-al">${p.signals.length && !S.legacy ? `<span class="alerts-n">${ico('alert')}${p.signals.length}</span>` : '<span class="dim">—</span>'}</td>
      <td class="c-nba">${S.legacy ? '<span class="dim">—</span>' : esc(p.nbaShort)}</td>
      <td class="c-due">${p.due && !S.legacy ? `<span class="chip o">${ico('clock')}${esc(p.due)}</span>` : ''}</td>
      <td class="c-go" style="text-align:right;white-space:nowrap">${S.legacy ? '' : `<button class="mv" data-act="move" data-id="${id}" data-dir="-1" title="Move up">▲</button> <button class="mv" data-act="move" data-id="${id}" data-dir="1" title="Move down">▼</button>`}</td>
    </tr>`;
  }).join('');
  const kp = (ic, cls, n, l, act, f) => `<button class="kpi" data-act="${act}" data-f="${f || ''}"><span class="ic ${cls}">${ico(ic)}</span><div><b>${n}</b><span>${l}</span></div></button>`;
  const fb = (f, l, n) => `<button class="fbtn ${S.filter === f ? 'on' : ''}" data-act="filter" data-f="${f}">${l}<em>${n}</em></button>`;
  return `<div class="pagehead"><div><h1>Good morning, Maria</h1><div class="sub">5 members need a call today · 48 active cases</div></div>
      <div class="r"><button class="heldlink" id="heldbtn" data-act="held">${ico('eyeoff')}${nHeld} alert held back</button></div></div>
    <div class="kpis">${kp('phone', 'o', 5, 'to call today', 'filter', 'call')}${kp('clock', 'o', nDue, 'deadlines this week', 'filter', 'due')}${kp('alert', '', nAlerts, 'new alerts', 'filter', 'call')}${kp('shield', 't', nHeld, 'false alarm held back', 'held')}</div>
    ${S.legacy ? `<div class="ban g" style="margin-bottom:12px">${ico('list')}<div class="tx"><b>Today's typical worklist:</b> A–Z, no ranking, no reasons. Dorothy is #3 and Marcus #9.</div><button class="btn sm" data-act="legacy">Back to ranked</button></div>` : ''}
    <div class="card"><div class="hd"><div class="filters">${fb('all', 'All', 10)}${fb('call', 'Call today', 5)}${fb('due', 'Deadline this week', nDue)}${fb('reach', 'Hard to reach', nReach)}</div>
      <span class="r dim" style="font-size:12px">${S.legacy ? 'A–Z' : 'Sorted by priority'}</span></div>
      <div style="overflow-x:auto"><table class="q"><thead><tr><th>#</th><th>Member</th><th>Priority</th><th class="c-why">Why now</th><th class="c-al">Alerts</th><th class="c-nba">Next step</th><th class="c-due">Deadline</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}

/* ------------------------------------------------------------------ MEMBER */
function head(p, compact) {
  const lang = p.languageFlag ? `<b style="color:var(--odark)">Spanish (file: English)</b>` : `<b>${esc(p.language)}</b>`;
  const sc = p.score >= 7 ? 'hi' : p.score >= 3 ? 'md' : 'lo';
  return `<div class="mhead"><div class="avatar">${ini(p)}</div><div class="nm"><h1>${esc(p.name)} <span class="chip g">${p.age} ${p.sex}</span><span class="chip">${esc(p.plan)}</span></h1>
    <div class="facts"><span>${esc(p.program)}</span><span>Doctor <b>${esc(p.pcp)}</b></span><span>Language ${lang}</span>${p.authRep !== '—' ? `<span>Can speak for her/him <b>${esc(p.authRep.split(',')[0])}</b></span>` : ''}</div></div>
    <div class="act"><button class="score ${sc}" data-act="score" data-id="${p.id}"><span class="dot">${ico('spark')}</span>${p.score.toFixed(1)}</button>
    ${compact ? '' : `<button class="btn primary lg" id="startcall" data-act="call" data-id="${p.id}">${ico('phone')}Start call</button>`}</div></div>`;
}
function banners(p) {
  const b = [];
  if (p.identity) { const st = S.idMatch[p.id], m = p.identity;
    b.push(`<div class="ban ${st === 'yes' ? 't' : 'o'}" id="ban-id">${ico(st === 'yes' ? 'check' : 'link')}<div class="tx"><b>${st === 'yes' ? 'Records linked' : `Same person? “${esc(m.name)}” at ${esc(m.facility)}`}</b> <span class="dim">· match ${m.confidence} · ${m.records.length} records</span> ${flaw('IMP-P3-01')}</div>
      ${st ? '' : `<button class="btn sm" data-act="why" data-k="id">Why?</button><button class="btn sm teal" data-act="idm" data-v="yes">Same person</button><button class="btn sm" data-act="idm" data-v="no">Not her</button>`}</div>`); }
  if (p.utr) b.push(`<div class="ban ${S.utr[p.id] ? 't' : 'o'}">${ico('clock')}<div class="tx"><b>${S.utr[p.id] ? 'Auto-close paused' : 'Case auto-closes as “unreachable” on Tue'}</b> ${rec(p.utr.rec, p.id)} ${flaw('IMP-P3-05')}</div>${S.utr[p.id] ? '' : `<button class="btn sm teal" data-act="utr">Pause</button>`}</div>`);
  if (p.fuh) { const d = ['4', '5', '6', '7', '8', '9', '10', '11'];
    b.push(`<div class="ban o" id="ban-fuh">${ico('clock')}<div class="tx"><b>7-day follow-up closes Wed 11 Nov</b> <span class="dim">· open video slot Tue 15:00</span> ${flaw('IMP-P4-04')}</div><div class="days">${d.map((x, i) => `<span class="${i < 5 ? 'p' : i === 5 ? 'n' : i === 7 ? 'e' : ''}">${x}</span>`).join('')}</div></div>`); }
  if (p.consentGate) b.push(`<div class="locked" id="ban-lock">${ico('lock')}<div><b>1 record locked</b> <span class="dim">· substance-use program; needs Marcus's consent</span> ${flaw('IMP-P4-03')}</div></div>`);
  return b.length ? `<div class="banners">${b.join('')}</div>` : '';
}
function alertCard(p, s, i) {
  const k = `${p.id}:${s.code}`, st = S.sig[k], urgent = ['S1', 'S3'].includes(s.code) && s.confidence.startsWith('High'), ai = s.mode.startsWith('AI');
  const open = S.open[k] ?? (i === 0);
  const srcs = [...new Set(s.evidence.map(e => e.src))];
  return `<div class="al ${urgent ? 'u' : ''} ${open ? 'open' : ''} ${st?.state === 'ok' ? 'done' : ''} ${st?.state === 'no' ? 'no' : ''}" id="al-${s.code}">
    <div class="h" data-act="alx" data-k="${k}"><span class="chip n">Rule ${s.code.slice(1)}</span><div class="t1"><b>${esc(RULE[s.code])}</b><div class="s">${esc(s.summary)}</div></div>${ico('down', 'chev')}</div>
    <div class="meta">${srcs.map(src).join('')}<span style="flex:1"></span>${ai ? `<span class="ai">${ico('spark')}AI flag</span>` : ''}<span class="chip ${s.confidence.startsWith('High') ? 't' : ''}">${esc(s.confidence.split('·')[0].trim())} confidence</span></div>
    ${open ? `<div class="body"><ul class="ev">${s.evidence.map(e => `<li>${src(e.src)}${rec(e.rec, p.id)}<span>${esc(e.text)}</span></li>`).join('')}</ul>
      ${s.guards.length ? `<div class="checks">${s.guards.map(g => `<span class="chip t">${ico('check')}${esc(g)}</span>`).join('')}</div>` : ''}
      <div class="gh" style="margin-top:4px">Suggested steps</div><div class="todo">${s.actions.map((a, j) => `<label><input type="checkbox" data-act="act" data-k="${k}:${j}" ${S.acts[`${k}:${j}`] ? 'checked' : ''}>${esc(a)}</label>`).join('')}</div></div>` : ''}
    <div class="foot">${st ? `<span class="${st.state === 'ok' ? 'ok' : 'chip g'}">${st.state === 'ok' ? ico('check') + 'Confirmed' : 'Dismissed'} · ${st.at}</span><button class="btn sm ghost" data-act="undo" data-k="${k}">Undo</button>`
      : `<button class="btn sm teal" data-act="ok" data-k="${k}">${ico('check')}Confirm</button><button class="btn sm" data-act="no" data-k="${k}">Dismiss</button>`}
      <span class="r">${esc(s.measure.split('(')[0])}</span></div></div>`;
}
function tabAlerts(p) {
  if (!p.signals.length) return `<div class="empty">${ico('check')} No alerts. ${esc(first(p))} is on track: ${esc(p.nbaShort.toLowerCase())}.</div>`;
  const cfs = p.conflicts.length ? `<div class="card" id="disagree" style="margin-top:14px"><div class="hd"><h3>Sources disagree</h3><span class="chip">${p.conflicts.length}</span></div><div class="bd" style="padding-top:4px;padding-bottom:4px">
    ${p.conflicts.map(c => { const done = S.conf[`${p.id}:${c.topic}`] || c.severity === 'Resolved';
      return `<div class="cf"><div class="side">${src(c.a.src)} <span class="dim">${esc(c.a.at)}</span><b>${esc(c.a.value)}</b></div><div class="vs">VS</div><div class="side">${src(c.b.src)} <span class="dim">${esc(c.b.at)}</span><b>${esc(c.b.value)}</b></div>
        <div class="foot"><span class="sev ${done ? 'Resolved' : c.severity}">${done ? 'Resolved' : c.severity}</span><b style="color:var(--ink)">${esc(c.topic)}</b><span style="flex:1"></span>${done ? '' : `<button class="btn sm" data-act="why" data-k="cf:${esc(c.topic)}">Why?</button><button class="btn sm" data-act="cf" data-k="${esc(c.topic)}">Reconciled</button>`}</div></div>`; }).join('')}</div></div>` : '';
  const held = p.suppressed.map(s => `<div class="ban g" style="margin-bottom:10px">${ico('eyeoff')}<div class="tx"><b>Held back:</b> ${esc(s.summary)} ${flaw('IMP-P5-02')}</div><button class="btn sm" data-act="held">Details</button></div>`).join('');
  return p.signals.map((s, i) => alertCard(p, s, i)).join('') + held + cfs;
}
function tabMeds(p) {
  const meds = `<div class="card"><table class="t"><thead><tr><th>Medicine</th><th>Doctor's plan</th><th>Pharmacy</th><th>Status</th></tr></thead><tbody>
    ${p.meds.map(m => `<tr><td><b>${esc(m.name)}</b> ${rec(m.rec, p.id)}</td><td>${esc(m.clinical)}</td><td>${esc(m.pharmacy)}</td><td class="${/^OK/.test(m.status) ? 'good' : 'bad'}">${esc(m.status)}</td></tr>`).join('')}</tbody></table></div>`;
  const labs = p.labs.length ? `<div class="card" style="margin-top:14px"><div class="hd"><h3>Labs</h3></div><table class="t"><tbody>${p.labs.map(l => `<tr><td>${esc(l.test)} ${rec(l.rec, p.id)}</td><td><b>${esc(l.value)}</b> ${l.flag ? `<span class="chip o">${l.flag === 'H' ? 'High' : 'Low'}</span>` : ''}</td><td class="dim">${esc(l.at)}</td></tr>`).join('')}</tbody></table></div>` : '';
  return meds + labs;
}
function tabTimeline(p) {
  const items = [...p.timeline].sort((a, b) => b.at.localeCompare(a.at));
  return `<div class="card"><div class="hd"><h3>Timeline</h3><span class="r dim" style="font-size:12px">Newest first · ○ = expected, not received yet</span></div><div class="bd"><ul class="tl">
    ${items.map(t => `<li class="${t.visible ? '' : 'fut'}" data-rec="${t.rec}"><span class="d">${fdate(t.at)}</span><span class="dot"></span>${src(t.src)}<span>${esc(t.text)} ${rec(t.rec, p.id)} ${flaw(t.flag)}<small>Received ${esc(t.received)}</small></span></li>`).join('')}</ul></div></div>`;
}
function contactRows(p, withCall) {
  const cs = [...p.contacts].sort((a, b) => a.rank - b.rank);
  return cs.map((c, i) => { const dead = /Disconnected|Locked/.test(c.status);
    return `<tr class="${dead ? 'dim' : ''}"><td><b style="font-variant-numeric:tabular-nums">${esc(c.number)}</b><div class="dim" style="font-size:12px">${esc(c.owner)}</div></td><td>${esc(c.type)}</td><td>${esc(c.bestTime)}</td>
      <td>${/^Yes/.test(c.textConsent) ? '<span class="chip t">Texts OK</span>' : /Locked/.test(c.status) ? `<span class="chip g">${ico('lock')}Locked</span>` : '<span class="chip g">No consent</span>'}</td>
      <td class="${dead ? 'bad' : ''}">${esc(c.status)}<div class="dim" style="font-size:11.5px">${src(c.source)} ${esc(fdate(c.updated))}</div></td></tr>`; }).join('');
}
function tabContacts(p) { return `<div class="card"><table class="t"><thead><tr><th>Number</th><th>Type</th><th>Best time</th><th>Texts</th><th>Status</th></tr></thead><tbody>${contactRows(p)}</tbody></table></div>`; }
function tabNotes(p) {
  const signed = S.signed[p.id] && S.ai['note:' + p.id]?.result;
  const notes = p.timeline.filter(t => t.src === 'CASE' || t.src === 'CON').sort((a, b) => b.at.localeCompare(a.at));
  return `${signed ? `<div class="card" style="margin-bottom:12px"><div class="hd"><span class="ok">${ico('check')}Signed ${S.signed[p.id]}</span><h3>Call note</h3></div><div class="bd">${esc(signed.summary)}</div></div>` : ''}
    <div class="card"><table class="t"><tbody>${notes.map(n => `<tr><td class="dim" style="width:110px">${fdate(n.at)}</td><td>${src(n.src)}</td><td>${esc(n.text)} ${rec(n.rec, p.id)}</td></tr>`).join('') || '<tr><td class="dim">No notes yet</td></tr>'}</tbody></table></div>`;
}
function sideRail(p) {
  const plan = p.signals.flatMap(s => s.actions.slice(0, 1)).slice(0, 4);
  const fresh = p.sources.map(([sname, d]) => { const stale = /days\)|not|expected|consent|missing|\(stay/.test(d); return `<li><span class="fd ${stale ? 's' : ''}"></span><b style="width:74px;flex:none">${esc(SRCN[sname] || sname)}</b><span class="dim">${esc(d)}</span></li>`; }).join('');
  return `<div class="nbacard"><div class="lbl">Suggested next step</div><p>${esc(p.nba)}</p><button class="btn orange" data-act="call" data-id="${p.id}">${ico('phone')}Start call</button></div>
    ${plan.length ? `<div class="card side-card"><div class="hd"><h3>Suggested call plan</h3><span class="r chip g">Editable</span></div><div class="bd todo">${plan.map((a, j) => `<label><input type="checkbox">${esc(a)}</label>`).join('')}</div></div>` : ''}
    ${p.gaps.length ? `<div class="card side-card"><div class="hd"><h3>Open quality gaps</h3></div><div class="bd" style="display:flex;flex-wrap:wrap;gap:5px">${p.gaps.map(g => `<span class="chip o">${esc(g.split(':')[0])}</span>`).join('')}</div></div>` : ''}
    <div class="card side-card"><div class="hd"><h3>Data freshness</h3></div><div class="bd" style="padding-top:2px;padding-bottom:2px"><ul class="mini">${fresh}</ul></div></div>`;
}
function member() {
  const p = P(S.pid), rank = S.order.indexOf(p.id) + 1;
  const T = [['alerts', 'Alerts', p.signals.length], ['meds', 'Medicines'], ['timeline', 'Timeline'], ['contacts', 'Contacts', p.contacts.length], ['notes', 'Notes']];
  const body = ({ alerts: tabAlerts, meds: tabMeds, timeline: tabTimeline, contacts: tabContacts, notes: tabNotes })[S.tab](p);
  return `<div class="crumb"><button data-act="nav" data-h="today">${ico('back')}Today</button><span>· #${rank} of today's list</span></div>
    ${head(p)}${banners(p)}
    <div class="mgrid"><div><div class="tabs">${T.map(([k, l, n]) => `<button class="tab ${S.tab === k ? 'on' : ''}" data-act="nav" data-h="m/${p.id}/${k}">${l}${n ? `<em>${n}</em>` : ''}</button>`).join('')}</div>${body}</div>
    <div>${sideRail(p)}</div></div>`;
}

/* ------------------------------------------------------------------ CALL */
function enterStep() {
  const p = P(S.pid);
  if (S.step === 'prep' && !S.ai['brief:' + p.id]) runAI('brief', p.id);
  if (S.step === 'live') S.start[p.id] = Date.now();
  if (S.step === 'wrap' && p.hero && !S.ai['note:' + p.id]) runAI('note', p.id);
}
function steps() {
  const st = [['prep', 'Prepare'], ['live', 'Call'], ['wrap', 'Wrap up']], cur = st.findIndex(s => s[0] === S.step);
  return `<div class="steps">${st.map(([k, l], i) => `<button class="step ${i === cur ? 'on' : i < cur ? 'done' : ''}" data-act="nav" data-h="call/${S.pid}/${k}"><i>${i < cur ? '✓' : i + 1}</i>${l}</button>`).join('')}</div>`;
}
function aiMeta(r) {
  if (!r || r.loading) return '';
  return r.source === 'gemini' ? `<span class="ai">${ico('spark')}AI · ${esc(r.model)}</span>` : `<span class="chip g" title="${esc(r.reason || '')}">${ico('spark')}Pre-written draft</span>`;
}
function prep(p) {
  const cs = [...p.contacts].sort((a, b) => a.rank - b.rank), best = cs.find(c => !/Disconnected|Locked/.test(c.status)) || cs[0];
  const textable = cs.find(c => /^Yes/.test(c.textConsent) && !/Locked/.test(c.status));
  const r = S.ai['brief:' + p.id];
  let brief;
  if (!r || r.loading) brief = `<div class="skel" style="width:92%"></div><div class="skel" style="width:80%"></div><div class="skel" style="width:88%"></div><div class="skel" style="width:70%"></div><div class="dim" style="font-size:12px;margin-top:8px"><span class="spinner"></span> Reading ${p.recordIds.length} records…</div>`;
  else if (!r.result) brief = `<div class="empty">Routine check-in. No brief needed.</div>`;
  else brief = `<ul class="brief">${r.result.lines.map((l, i) => `<li><span class="k">${i + 1}</span><span>${esc(l.text)} ${l.cites.map(c => rec(c, p.id)).join('')}</span></li>`).join('')}</ul>
    <div style="margin-top:12px;font-weight:700;font-size:12.5px">Ask</div><ol class="qs">${r.result.questions.map(q => `<li>${esc(q)}</li>`).join('')}</ol>
    ${r.dropped?.length ? `<div class="chip o" style="margin-top:8px">${ico('shield')}${r.dropped.length} uncited line removed</div>` : ''}`;
  return `<div class="cgrid"><div>
      <div class="card"><div class="hd"><h3>Call</h3><span class="r dim" style="font-size:12px">Best number first</span></div>
        <div class="bestnum"><div style="flex:1"><div class="n">${esc(best.number)}</div><div class="w">${esc(best.owner)} · ${esc(best.bestTime)}</div></div><button class="btn teal lg" data-act="nav" data-h="call/${p.id}/live">${ico('phone')}Call</button></div>
        ${cs.filter(c => c !== best).map(c => { const dead = /Disconnected|Locked/.test(c.status);
          return `<div class="othernum ${dead ? 'dead' : ''}"><span class="n">${esc(c.number)}</span><span class="dim" style="flex:1">${esc(c.owner.split(',')[0])} · ${esc(c.bestTime)}</span>${/Locked/.test(c.status) ? `<span class="chip g">${ico('lock')}Needs release</span>` : dead ? '<span class="chip g">Dead</span>' : `<button class="btn sm" data-act="nav" data-h="call/${p.id}/live">Call</button>`}</div>`; }).join('')}
      </div>
      <div class="card" style="margin-top:14px"><div class="hd"><h3>If no answer</h3></div><div class="bd">
        ${textable ? `<div style="display:flex;gap:10px;align-items:center"><span class="dim" style="flex:1;font-size:12.5px">Callback text to ${esc(textable.number)} · no health details</span><button class="btn sm" data-act="sms">${ico('msg')}Send text</button></div>`
          : `<div class="locked">${ico('lock')}<span>No text consent yet. Ask on the call.</span></div>`}</div></div>
    </div>
    <div class="card" id="briefcard"><div class="hd"><h3>Call brief</h3><span class="r">${aiMeta(r)}</span></div><div class="bd">${brief}</div></div></div>`;
}
function live(p) {
  const cs = [...p.contacts].sort((a, b) => a.rank - b.rank), best = cs.find(c => !/Disconnected|Locked/.test(c.status)) || cs[0];
  const qs = (S.ai['brief:' + p.id]?.result?.questions) || p.cachedBrief?.questions || ['How are you feeling today?', 'Any changes since we last spoke?'];
  const aiQs = !!S.ai['brief:' + p.id]?.result;
  const clean = a => a.replace(/^Call( now)?[:,]?\s*/i, '').replace(/^\w/, c => c.toUpperCase());
  const plan = p.signals.flatMap(s => s.actions.slice(0, 2)).filter(a => !/^Call (\(|at |now$)/i.test(a) && !/^Call now: confirm/i.test(a)).map(clean).slice(0, 4);
  const extra = S.extra[p.id] || [], skip = S.skip[p.id] || {};
  const items = [...qs.map(q => ['q', q]), ...plan.map(a => ['a', a]), ...extra.map(x => ['m', x])].map((it, i) => [...it, i]).filter(it => !skip[it[2]]);
  const chk = S.chk[p.id] || {};
  const row = ([k, t, i]) => `<label><input type="checkbox" data-act="chk" data-i="${i}" ${chk[i] ? 'checked' : ''}><span style="flex:1">${esc(t)}</span><button class="btn sm ghost" data-act="skip" data-i="${i}" title="Not needed">${ico('x')}</button></label>`;
  const grp = (k, title, tag) => { const g = items.filter(x => x[0] === k); return g.length ? `<div class="grp"><div class="gh">${title}${tag}</div>${g.map(row).join('')}</div>` : ''; };
  return `<div class="live"><div class="av">${ini(p)}</div><div class="who"><b>${esc(p.name)}</b><span>${esc(best.number)} · ${esc(best.owner.split(',')[0])}</span></div>
      <div class="tm" id="timer">00:00</div><button class="btn red lg" data-act="nav" data-h="call/${p.id}/wrap">${ico('endcall')}End call</button></div>
    <div class="cgrid"><div class="card" id="checklist"><div class="hd"><h3>Suggested for this call</h3><span class="r dim" style="font-size:12px">${items.filter(x => chk[x[2]]).length}/${items.length} covered</span></div>
      <div class="bd checklist">${grp('q', 'Questions to consider', aiQs ? `<span class="ai">${ico('spark')}AI</span>` : `<span class="chip g">Template</span>`)}${grp('a', 'Steps from the alerts', '<span class="chip">Rules</span>')}${grp('m', 'Added by Maria', '')}
        <div class="addrow"><input id="addi" placeholder="Add your own item…" autocomplete="off"><button class="btn sm" data-act="add">Add</button></div>
        <p class="hint">${ico('shield')}Suggestions only. Maria decides what to ask and do; nothing here is a clinical order.</p></div></div>
      <div class="card"><div class="hd"><h3>Quick notes</h3><span class="r chip g">${ico('file')}Transcript on</span></div><div class="bd"><textarea id="qn" data-qn="${p.id}" rows="9" placeholder="Anything worth remembering…">${esc(S.qn[p.id] || '')}</textarea></div></div></div>`;
}
function wrap(p) {
  if (!p.hero) return `<div class="card"><div class="done-hero"><div class="tick">${ico('check')}</div><h2>Routine call logged</h2><p class="dim">Nothing else to document for ${esc(first(p))} today.</p>
    <button class="btn primary" data-act="next">Next member ${ico('arrow')}</button></div></div>`;
  const r = S.ai['note:' + p.id], rv = S.rev[p.id] || {}, ed = S.edit[p.id] || {};
  if (S.signed[p.id] && r?.result) {
    const n = r.result;
    return `<div class="card"><div class="done-hero"><div class="tick">${ico('check')}</div><h2 style="margin:0">Signed at ${S.signed[p.id]}</h2><p class="dim" style="margin:4px 0 0">One signature, five places updated.</p>
      <div class="fan"><div>${ico('file')}Case note</div><div>${ico('shield')}Quality record</div><div>${ico('tasks')}${n.tasks.length} tasks</div><div>${ico('phone')}Contacts</div><div>${ico('msg')}Doctor message</div></div>
      <div style="display:flex;gap:8px;justify-content:center"><button class="btn" data-act="nav" data-h="today">Today</button><button class="btn primary" data-act="next">Next member ${ico('arrow')}</button></div></div></div>`;
  }
  const tx = S.tx[p.id] ?? p.transcript;
  let note;
  if (!r || r.loading) note = `<div class="skel"></div><div class="skel" style="width:85%"></div><div class="skel" style="width:90%"></div><div class="skel" style="width:75%"></div><div class="dim" style="font-size:12px;margin-top:8px"><span class="spinner"></span> Drafting the note from the call…</div>`;
  else { const n = r.result, tot = n.fields.length, done = n.fields.filter((_, i) => rv[i]).length;
    note = `<div class="field" style="background:var(--bsoft2)"><div class="fh">Summary</div><div style="margin-top:4px">${esc(n.summary)}</div></div>
      ${n.fields.map((f, i) => `<div class="field ${rv[i] ? 'rv' : ''}"><div class="fh">${esc(f.label)}<label><input type="checkbox" data-act="rev" data-i="${i}" ${rv[i] ? 'checked' : ''}>Checked</label></div>
        <textarea rows="${Math.max(1, Math.ceil(String(ed[i] ?? f.value).length / 80))}" data-edit="${i}">${esc(ed[i] ?? f.value)}</textarea>
        <div class="fs">${f.source.split('·').map(s => s.trim()).map(s => s === 'call' ? '<span class="src">Call</span>' : rec(s, p.id)).join('')}</div></div>`).join('')}
      <div style="font-weight:700;font-size:12.5px;margin:12px 0 4px">Tasks</div>
      <table class="t"><tbody>${n.tasks.map(t => `<tr><td>${esc(t.task)}</td><td class="dim">${esc(t.owner)}</td><td class="dim" style="white-space:nowrap">${esc(t.due)}</td></tr>`).join('')}</tbody></table>
      <div class="signbar"><div class="pg"><b>${done}/${tot} checked</b><div class="bar"><i style="width:${done / tot * 100}%"></i></div></div>
        <button class="btn sm" style="background:transparent;color:#fff;border-color:#ffffff40" data-act="revall">Check all</button><button class="btn orange" data-act="sign" ${done < tot ? 'disabled' : ''}>${ico('check')}Sign</button></div>`; }
  return `<div class="cgrid"><div class="card"><div class="hd"><h3>Call transcript</h3><span class="r chip g">Synthetic</span></div><div class="bd">
      <textarea id="txa" data-tx="${p.id}" rows="16">${esc(tx)}</textarea><div style="margin-top:8px"><button class="btn sm" data-act="redraft">${ico('spark')}Re-draft from transcript</button></div></div></div>
    <div class="card" id="notecard"><div class="hd"><h3>Draft note</h3><span class="r">${aiMeta(r)}</span></div><div class="bd">${note}</div></div></div>`;
}
function call() {
  const p = P(S.pid);
  return `<div class="crumb"><button data-act="nav" data-h="m/${p.id}">${ico('back')}${esc(p.name)}</button></div>
    <div class="pagehead"><div style="display:flex;gap:12px;align-items:center"><div class="avatar" style="width:40px;height:40px;font-size:14px">${ini(p)}</div><div><h1>${esc(p.name)}</h1><div class="sub">${esc(p.nbaShort)}</div></div></div>
      <div class="r">${steps()}</div></div>
    ${({ prep, live, wrap })[S.step](p)}`;
}
function tick() {
  clearInterval(tick.t);
  tick.t = setInterval(() => { const el = $('#timer'); if (!el) return clearInterval(tick.t);
    const s = Math.floor((Date.now() - (S.start[S.pid] || Date.now())) / 1000); el.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }, 500);
}

/* ------------------------------------------------------------------ TASKS + INSIGHTS */
function tasks() {
  const due = S.data.patients.filter(p => /^Visit/.test(p.due)).map(p => ({ task: `Doctor visit booked for ${first(p)}`, owner: 'Maria', due: p.due.replace('Visit by ', '').replace('Auto-closes ', ''), pid: p.id, auto: true }));
  const all = [...S.tasks, ...due];
  return `<div class="pagehead"><div><h1>Tasks</h1><div class="sub">${S.tasks.filter(t => !t.done).length} from today's calls · ${due.length} deadlines this week</div></div></div>
    <div class="card"><table class="t"><thead><tr><th style="width:30px"></th><th>Task</th><th>Member</th><th>Owner</th><th>Due</th></tr></thead><tbody>
    ${all.map((t, i) => `<tr><td><input type="checkbox" ${t.done ? 'checked' : ''} ${t.auto ? 'disabled' : `data-act="task" data-i="${i}"`} style="accent-color:var(--teal)"></td><td style="${t.done ? 'text-decoration:line-through;color:var(--dim)' : ''}">${esc(t.task)} ${t.auto ? '<span class="chip o">Deadline</span>' : '<span class="chip t">From call</span>'}</td>
      <td><button class="btn sm ghost" data-act="open" data-id="${t.pid}">${esc(P(t.pid).name)}</button></td><td class="dim">${esc(t.owner)}</td><td class="dim">${esc(t.due)}</td></tr>`).join('')}
    </tbody></table>${S.tasks.length ? '' : `<div class="bd dim" style="font-size:12.5px">Tasks from calls appear here when Maria signs a note.</div>`}</div>`;
}
function insights() {
  const H = heroes(), rules = Object.keys(RULE);
  const row = c => { const fired = H.filter(p => p.signals.some(s => s.code === c)), held = H.filter(p => p.suppressed.some(s => s.code === c)).length;
    const ok = fired.filter(p => S.sig[`${p.id}:${c}`]?.state === 'ok').length, no = fired.filter(p => S.sig[`${p.id}:${c}`]?.state === 'no').length, rv = ok + no;
    return `<tr><td><span class="chip n">Rule ${c.slice(1)}</span></td><td>${esc(RULE[c])}</td><td><b>${fired.length}</b></td><td>${held || '—'}</td><td>${ok}</td><td>${no}</td>
      <td style="width:120px">${rv ? `<div class="bar2"><i style="width:${ok / rv * 100}%"></i></div>` : '<span class="dim" style="font-size:12px">no reviews yet</span>'}</td></tr>`; };
  const feeds = S.data.feeds.map(([s, d, lag]) => `<tr><td>${src(s)}</td><td>${esc(d)}</td><td class="dim">${esc(lag)}</td></tr>`).join('');
  return `<div class="pagehead"><div><h1>Insights</h1><div class="sub">For the clinical lead · how the rules and the data are doing today</div></div></div>
    <div class="card" id="rulecard"><div class="hd"><h3>Alert rules</h3><span class="r dim" style="font-size:12px">Confirm and dismiss clicks feed this table live</span></div><div style="overflow-x:auto"><table class="t"><thead><tr><th>Rule</th><th>Checks for</th><th>Fired</th><th>Held back</th><th>Confirmed</th><th>Dismissed</th><th>Agree rate</th></tr></thead><tbody>${rules.map(row).join('')}</tbody></table></div></div>
    <div class="grid2" style="margin-top:16px"><div class="card"><div class="hd"><h3>Data feeds</h3></div><table class="t"><thead><tr><th>Source</th><th>Last received</th><th>Usual delay</th></tr></thead><tbody>${feeds}</tbody></table></div>
      <div class="card"><div class="hd"><h3>Queue overrides</h3><span class="chip">${S.log.length}</span></div><div class="bd">${S.log.length ? `<ul class="mini">${S.log.map(l => `<li><b>${l.at}</b><span>${esc(l.text)}</span><span class="dim" style="margin-left:auto">${esc(l.reason)}</span></li>`).join('')}</ul>` : '<span class="dim" style="font-size:12.5px">No overrides yet. Use ▲▼ on the Today list.</span>'}</div></div></div>`;
}

/* ------------------------------------------------------------------ popovers, drawers, modals */
function recIndex(p) {
  const m = {}, add = (r, s, text, at) => { if (!r) return; (m[r] ||= []); if (!m[r].some(x => x.text === text)) m[r].push({ s, text, at }); };
  p.signals.concat(p.suppressed).forEach(s => s.evidence.forEach(e => add(e.rec, e.src, e.text)));
  p.timeline.forEach(t => add(t.rec, t.src, t.text + (t.visible ? '' : ' (expected)'), t.at));
  p.meds.forEach(x => add(x.rec, 'RX', `${x.name}: ${x.pharmacy}`));
  p.labs.forEach(x => add(x.rec, 'LAB', `${x.test} ${x.value}, ${x.at}`));
  p.contacts.forEach(c => add(c.id, 'CON', `${c.number} · ${c.owner} · ${c.status}`));
  p.conflicts.forEach(c => { add(c.a.rec, c.a.src, `${c.topic}: ${c.a.value}`); add(c.b.rec, c.b.src, `${c.topic}: ${c.b.value}`); });
  if (p.identity) p.identity.records.forEach(r => add(r, 'ADT', `Filed under ${p.identity.name}, ${p.identity.facility}`));
  if (p.utr) add(p.utr.rec, 'CASE', p.utr.text);
  if (p.cachedBrief) p.cachedBrief.lines.forEach(l => l.cites.forEach(c => { if (!m[c]) add(c, c.split('-')[0], l.text); }));
  return m;
}
function popAt(el, html) {
  const pop = $('#pop'); pop.innerHTML = html; pop.hidden = false;
  const r = el.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
  let x = Math.min(innerWidth - w - 12, Math.max(12, r.left)), y = r.bottom + 6; if (y + h > innerHeight - 10) y = r.top - h - 6;
  pop.style.left = x + 'px'; pop.style.top = y + 'px';
}
function hidePop() { const p = $('#pop'); if (p) p.hidden = true; }
function showRec(el, id, pid) {
  const p = P(pid), items = recIndex(p)[id] || [];
  popAt(el, `<h5><span class="rec" style="cursor:default">${esc(id)}</span>${esc(p.name)}</h5>${items.map(i => `<p>${i.s ? src(i.s) + ' ' : ''}${esc(i.text)}${i.at ? ` <span class="dim">· ${fdate(i.at)}</span>` : ''}</p>`).join('') || '<p class="dim">See the Excel annex.</p>'}<p class="dim" style="font-size:11px;margin-top:6px">Same ID in the Excel annex.</p>`);
  document.querySelectorAll('.tl li.hl').forEach(n => n.classList.remove('hl')); const li = document.querySelector(`.tl li[data-rec="${CSS.escape(id)}"]`); if (li) li.classList.add('hl');
}
function showScore(el, id) {
  const p = P(id), r = (l, v, max, txt) => `<div style="display:grid;grid-template-columns:110px 1fr 40px;gap:8px;align-items:center;margin:5px 0"><span>${l}</span><div class="bar2"><i style="width:${v / max * 100}%;background:var(--navy2)"></i></div><b>${v}</b></div>`;
  popAt(el, `<h5>${ico('spark')}Why ${esc(first(p))} scores ${p.score.toFixed(1)}</h5>${r('How serious', p.risk, 5)}${r('How soon', p.window, 3)}${r('Can we reach', p.reach, 1)}
    <p class="dim" style="margin-top:6px">${p.risk} × ${p.window} × ${p.reach} = <b style="color:var(--ink)">${p.score.toFixed(1)}</b> · Maria can re-order with a reason.</p>`);
}
function drawer(title, html) { const d = $('#drawer'); d.innerHTML = `<div class="dh"><h2>${title}</h2><button class="btn sm ghost" data-act="dclose">${ico('x')}</button></div><div class="db">${html}</div>`; d.hidden = false; }
function heldDrawer() {
  const items = heroes().flatMap(p => p.suppressed.map(s => ({ p, s })));
  drawer('Held back', items.map(({ p, s }) => `<div class="card" style="margin-bottom:12px"><div class="hd"><span class="chip g">${ico('eyeoff')}Not alerted</span><h3>${esc(p.name)}</h3></div><div class="bd">
    <p style="margin:0 0 8px"><b>${esc(RULE[s.code])}</b></p><p style="margin:0 0 10px">${esc(s.summary)}</p>
    <ul class="ev">${s.evidence.map(e => `<li>${src(e.src)}${rec(e.rec, p.id)}<span>${esc(e.text)}</span></li>`).join('')}</ul>
    <div class="checks"><span class="chip t">${ico('check')}Mail order checked</span><span class="chip t">${ico('check')}Shipment arrives 10 Nov</span></div>
    <p class="dim" style="font-size:12.5px;margin:6px 0 0">Shown on ${esc(first(p))}'s call as a question instead.</p></div></div>`).join(''));
}
function flawsDrawer() {
  const by = {}; S.data.flaws.forEach(f => (by[f.patient] ||= []).push(f));
  drawer('Planted data traps (demo)', `<p class="dim" style="margin-top:0;font-size:12.5px">24 realistic data problems planted in the synthetic records, and how the workbench handles each. Same IDs as the Excel annex.</p>
    ${Object.entries(by).map(([pid, fs]) => `<div style="font-weight:700;margin:12px 0 6px">${esc(P(pid).name)}</div>${fs.map(f => `<div style="display:grid;grid-template-columns:86px 1fr;gap:8px;font-size:12.5px;padding:6px 0;border-bottom:1px solid var(--line)"><span class="flaw" style="display:inline-flex">${f.id}</span><span>${esc(f.flaw)}<br><span class="good">→ ${esc(f.handled)}</span></span></div>`).join('')}`).join('')}`);
}
function modal(html) { const m = $('#modal'); m.innerHTML = `<div class="box">${html}</div>`; m.hidden = false; }
function reasons(title, sub, opts, act, data) {
  modal(`<div class="mh"><h2>${title}</h2><p>${sub}</p></div><div class="mb reasons">${opts.map((o, i) => `<label><input type="radio" name="rs" value="${esc(o)}" ${i ? '' : 'checked'}>${esc(o)}</label>`).join('')}</div>
    <div class="mf"><button class="btn" data-act="mclose">Cancel</button><button class="btn primary" data-act="${act}" ${Object.entries(data).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ')}>Save</button></div>`);
}
const WHY = { id: m => `Date of birth and address match; the name differs by one letter and the hospital ID is new. Below 0.95 the system never merges records by itself, because a wrong merge puts someone else's history in this chart.` };
function closeAll() { $('#modal').hidden = true; $('#drawer').hidden = true; hidePop(); if (S.menu) showMenu(false); }

/* ------------------------------------------------------------------ AI */
async function runAI(mode, pid) {
  const p = P(pid), key = `${mode}:${pid}`;
  S.ai[key] = { loading: true };
  if (mode === 'note') { S.rev[pid] = {}; S.edit[pid] = {}; }
  const body = { mode, patientId: pid };
  if (mode === 'note') body.transcript = (S.tx[pid] ?? p.transcript) + (S.qn[pid] ? `\nMaria's quick notes: ${S.qn[pid]}` : '');
  try {
    const r = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    S.ai[key] = await r.json();
  } catch (e) { S.ai[key] = { source: 'cached', reason: 'offline', result: mode === 'brief' ? p.cachedBrief : p.cachedNote, dropped: [] }; }
  if (S.view === 'call' && S.pid === pid) render(true);
}

/* ------------------------------------------------------------------ guide bot + tour */
const TOUR = [
  { h: 'today', el: '.kpis', t: 'Monday, 8 am', x: "Maria has 48 cases. Overnight the workbench read 99 records from 13 sources and picked the 5 people she should call first." },
  { h: 'today', el: '#q-P1', t: 'Ranked, not just listed', x: 'Dorothy is #1. Tap any score to see the maths: how serious × how soon × the chance of reaching her.' },
  { h: 'today', el: '#heldbtn', t: 'Fewer, truer alerts', x: "One alert was held back. Margaret's refill looks late, but a mail-order box arrives tomorrow. False alarms teach nurses to ignore alerts." },
  { h: 'm/P1/alerts', el: '#al-S1', t: 'Every alert shows its proof', x: 'Each alert says what changed, which records prove it, and what was checked first. Tap any record ID to see it.' },
  { h: 'm/P1/alerts', el: '#disagree', t: 'Disagreements, side by side', x: 'Lisinopril was stopped at discharge but refilled. Both sources show with their dates; Maria decides.' },
  { h: 'm/P1/alerts', el: '#startcall', t: 'One button to act', x: 'Everything Maria needs for the call is one tap away.' },
  { h: 'call/P1/prep', el: '#briefcard', t: 'A 30-second brief', x: "AI read only Dorothy's records. Every line cites a record, or the server deletes it." },
  { h: 'call/P1/live', el: '#checklist', t: 'Suggestions, not orders', x: 'AI suggests questions and the alerts suggest steps, each labelled. Maria ticks, skips or adds her own: she runs the call.' },
  { h: 'call/P1/wrap', el: '#notecard', t: 'Wrap up in minutes', x: 'AI drafts the note from the call. Maria checks each field and signs once: five systems update.' },
  { h: 'm/P3/alerts', el: '#ban-id', t: 'Same person?', x: "Keisha's ER visit was filed as “KEYSHA” with a new hospital ID. Records never merge by themselves: Maria confirms." },
  { h: 'm/P4/alerts', el: '#ban-fuh', t: 'Deadlines and consent', x: "Marcus's 7-day follow-up closes Wednesday. His substance-use record stays locked without his consent." },
  { h: 'insights', el: '#rulecard', t: 'For the clinical lead', x: "Every confirm, dismiss and re-order lands here, so the rules improve each week. That's the tour. Explore any member!" },
];
const EXPLAIN = {
  today: ['Today', "Who needs Maria first, and why. Score = how serious × how soon × chance of reaching them. Tap a row to open the member; ▲▼ re-orders and asks for a reason."],
  m: ['Member view', 'One member on one screen: alerts with their proof, medicines, timeline and contacts. The next best action and Start call sit on the right.'],
  call: ['Call', 'Three steps: prepare, call, wrap up. The checklist is only a suggestion: AI proposes questions, rules propose steps, Maria decides. AI drafts the note; nothing is saved until she signs.'],
  tasks: ['Tasks', 'Deadlines this week plus every task created when Maria signs a call note.'],
  insights: ['Insights', 'For the clinical lead: how each alert rule performs and how fresh each data feed is.'],
};
function say(html) {
  const b = $('#bubble'); b.innerHTML = html; b.hidden = false; $('#ping').hidden = true;
  const g = $('#guide'); g.classList.add('talk'); clearTimeout(say.t); say.t = setTimeout(() => g.classList.remove('talk'), 1500);
}
function showMenu(on) {
  S.menu = on;
  if (!on) { if (S.tour < 0) $('#bubble').hidden = true; return; }
  say(`<div class="who">${ico('spark')}Demo guide<button class="x" data-act="bclose">${ico('x')}</button></div>
    <h4>Hi! I'm your guide.</h4><p>This is Maria's workbench on a Monday morning. Want the 5-minute tour?</p>
    <div class="menu"><button class="btn orange" data-act="tour">Start the tour</button><button class="btn" data-act="explain">${ico('spark')}Explain this screen</button>
      <button class="btn" data-act="legacy">${ico('list')}${S.legacy ? 'Back to the ranked list' : "Compare with today's worklist"}</button>
      <button class="btn" data-act="flaws">${ico('alert')}${document.body.classList.contains('flaws') ? 'Hide' : 'Show'} planted data traps</button>
      <button class="btn ghost" data-act="reset">Reset demo</button></div>`);
}
function tourGo(i) {
  closeAll();
  if (i < 0 || i >= TOUR.length) { S.tour = -1; $('#spot').hidden = true; $('#bubble').hidden = true; return; }
  S.tour = i; const s = TOUR[i];
  say(`<div class="who">${ico('spark')}Tour · ${i + 1} of ${TOUR.length}<button class="x" data-act="tend">${ico('x')}</button></div><h4>${esc(s.t)}</h4><p>${esc(s.x)}</p>
    <div class="nav"><div class="dots">${TOUR.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div>${i ? `<button class="btn sm" data-act="tprev">Back</button>` : ''}<button class="btn sm orange" data-act="tnext">${i === TOUR.length - 1 ? 'Finish' : 'Next'}</button></div>`);
  go(s.h);
}
function spotOn() {
  if (S.tour < 0) return; const el = $(TOUR[S.tour].el);
  if (!el) { $('#spot').hidden = true; return; }
  el.scrollIntoView({ block: 'center', behavior: 'smooth' }); setTimeout(placeSpot, 380); placeSpot();
}
function placeSpot() {
  const sp = $('#spot'); if (S.tour < 0) { sp.hidden = true; return; }
  const el = $(TOUR[S.tour].el); if (!el) { sp.hidden = true; return; }
  const r = el.getBoundingClientRect(), pad = 6;
  Object.assign(sp.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' }); sp.hidden = false;
}

/* ------------------------------------------------------------------ events */
function onInput(e) {
  const t = e.target;
  if (t.id === 'search') {
    const q = t.value.trim().toLowerCase(), box = $('#results');
    const hits = q ? S.data.patients.filter(p => p.name.toLowerCase().includes(q) || p.member.toLowerCase().includes(q)).slice(0, 6) : [];
    box.innerHTML = hits.map(p => `<button data-act="open" data-id="${p.id}"><span class="avatar" style="width:28px;height:28px;font-size:11px;border-radius:8px">${ini(p)}</span><span><b>${esc(p.name)}</b><br><span class="dim" style="font-size:12px">${esc(p.program)}</span></span></button>`).join('');
    box.hidden = !hits.length; return;
  }
  if (t.dataset.tx) S.tx[t.dataset.tx] = t.value;
  if (t.dataset.qn) S.qn[t.dataset.qn] = t.value;
  if (t.dataset.edit !== undefined) (S.edit[S.pid] ||= {})[t.dataset.edit] = t.value;
}
function onClick(e) {
  const t = e.target.closest('[data-act]');
  if (!t) { if (!e.target.closest('#pop')) hidePop(); if (!e.target.closest('.search')) $('#results').hidden = true; if (e.target.id === 'modal') $('#modal').hidden = true; return; }
  const d = t.dataset, p = P(S.pid);
  const A = {
    nav: () => go(d.h),
    open: () => { $('#results').hidden = true; $('#search').value = ''; go(`m/${d.id}`); },
    call: () => go(`call/${d.id}/prep`),
    next: () => { const ids = S.order.filter(id => P(id).hero && !S.signed[id] && id !== S.pid); go(ids.length ? `m/${ids[0]}` : 'today'); },
    filter: () => { S.filter = d.f || 'all'; if (S.view !== 'today') go('today'); else render(true); },
    score: () => { e.stopPropagation(); showScore(t, d.id); },
    rec: () => { e.stopPropagation(); showRec(t, d.rec, d.pid); },
    held: heldDrawer,
    dclose: () => $('#drawer').hidden = true,
    move: () => { e.stopPropagation(); reasons(`Move ${esc(P(d.id).name)} ${+d.dir < 0 ? 'up' : 'down'}?`, 'Your reason helps tune the ranking.', ['Clinical judgment: more urgent than the score shows', 'Member asked for a specific time', 'Already handled elsewhere', 'Waiting on another team'], 'moveok', { id: d.id, dir: d.dir }); },
    moveok: () => { const i = S.order.indexOf(d.id), j = i + +d.dir; $('#modal').hidden = true; if (j < 0 || j >= S.order.length) return;
      const other = P(S.order[j]); [S.order[i], S.order[j]] = [S.order[j], S.order[i]];
      S.log.unshift({ at: clock(), text: `${P(d.id).name} ${+d.dir < 0 ? 'above' : 'below'} ${other.name}`, reason: ($('input[name=rs]:checked') || {}).value }); render(true); toast('Re-ordered · reason saved'); },
    mclose: () => $('#modal').hidden = true,
    alx: () => { S.open[d.k] = !($(`#al-${d.k.split(':')[1]}`)?.classList.contains('open')); render(true); },
    ok: () => { S.sig[d.k] = { state: 'ok', at: clock() }; render(true); toast('Alert confirmed'); },
    no: () => reasons('Dismiss this alert?', 'Dismiss reasons help retune the rule.', ['Already resolved', 'Data error in the source', 'Not relevant for this member', 'Member declined'], 'nook', { k: d.k }),
    nook: () => { S.sig[d.k] = { state: 'no', at: clock(), reason: ($('input[name=rs]:checked') || {}).value }; $('#modal').hidden = true; render(true); },
    undo: () => { delete S.sig[d.k]; render(true); },
    act: () => { S.acts[d.k] = t.checked; },
    why: () => { e.stopPropagation(); const k = d.k; const c = k.startsWith('cf:') ? p.conflicts.find(x => x.topic === k.slice(3)) : null;
      popAt(t, `<p style="margin:0">${esc(c ? c.note : WHY[k](p))}</p>`); },
    cf: () => { S.conf[`${p.id}:${d.k}`] = true; render(true); },
    idm: () => { S.idMatch[p.id] = d.v; render(true); toast(d.v === 'yes' ? '3 hospital records linked' : 'Kept separate'); },
    utr: () => { S.utr[p.id] = true; render(true); toast('Auto-close paused'); },
    sms: () => toast('Callback text queued for the 2-hour no-answer rule'),
    chk: () => { (S.chk[p.id] ||= {})[d.i] = t.checked; render(true); },
    skip: () => { e.stopPropagation(); (S.skip[p.id] ||= {})[d.i] = true; render(true); toast('Removed from this call'); },
    add: () => { const v = $('#addi').value.trim(); if (!v) return; (S.extra[p.id] ||= []).push(v); render(true); setTimeout(() => $('#addi')?.focus(), 30); },
    redraft: () => { runAI('note', p.id); render(true); },
    rev: () => { (S.rev[p.id] ||= {})[d.i] = t.checked; render(true); },
    revall: () => { const n = S.ai['note:' + p.id].result.fields.length; S.rev[p.id] = Object.fromEntries([...Array(n).keys()].map(i => [i, true])); render(true); },
    sign: () => { S.signed[p.id] = clock(); (S.ai['note:' + p.id].result.tasks || []).forEach(x => S.tasks.push({ ...x, pid: p.id, done: false })); render(true); toast('Signed · 5 places updated'); },
    task: () => { S.tasks[+d.i].done = t.checked; render(true); },
    bot: () => { if (S.tour >= 0) return; showMenu(!S.menu); },
    bclose: () => showMenu(false),
    tour: () => { S.menu = false; tourGo(0); }, tnext: () => tourGo(S.tour + 1), tprev: () => tourGo(S.tour - 1), tend: () => tourGo(-1),
    explain: () => { S.menu = false; const [h, x] = EXPLAIN[S.view]; say(`<div class="who">${ico('spark')}Demo guide<button class="x" data-act="bclose">${ico('x')}</button></div><h4>${h}</h4><p>${x}</p><div class="nav"><span style="flex:1"></span><button class="btn sm" data-act="bot2">More</button><button class="btn sm orange" data-act="bclose">Got it</button></div>`); },
    bot2: () => showMenu(true),
    legacy: () => { S.legacy = !S.legacy; showMenu(false); go('today'); render(true); },
    flaws: () => { document.body.classList.toggle('flaws'); showMenu(false); if (document.body.classList.contains('flaws')) flawsDrawer(); },
    reset: () => { location.hash = 'today'; location.reload(); },
  };
  if (A[d.act]) { if (t.tagName !== 'INPUT') e.preventDefault(); A[d.act](); }
}
init();
