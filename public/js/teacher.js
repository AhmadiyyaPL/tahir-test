// Teacher page: results table, marking of open answers, per-task analysis, CSV export.
// The password is checked by the Apps Script, not here; this page holds no data itself.

import * as G from './grading.js';
import { call, loadConfig } from './api.js';
import { h, secStyle, fmtDate, fetchJSON, toggleTheme, syncThemeColor, registerServiceWorker } from './dom.js';

const PW = 'ta.teacherPw';
const app = document.getElementById('app');
const logoutBtn = document.getElementById('logout');

let config = null;
let index = [];
const defs = {};          // test id → test JSON
let results = [];         // [{ receivedAt, data }]
let grades = new Map();   // "sid|n" → { points, comment, gradedAt }
let st = { tab: 'results', testId: null, from: '', q: '', onlyOpen: true, sort: 'date', dir: -1 };

registerServiceWorker();
syncThemeColor();
document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
logoutBtn.addEventListener('click', () => { sessionStorage.removeItem(PW); results = []; renderLogin(); });
boot();

async function boot() {
  config = await loadConfig();
  try { index = (await fetchJSON('tests/index.json')).tests || []; } catch (e) { index = []; }
  const pw = sessionStorage.getItem(PW);
  if (pw) await login(pw, true); else renderLogin();
}

async function loadDef(id) {
  if (defs[id]) return defs[id];
  const entry = index.find((x) => x.id === id);
  if (!entry) return null;
  try { defs[id] = await fetchJSON('tests/' + entry.file); } catch (e) { return null; }
  return defs[id];
}

// ------------------------------------------------------------------ login

function renderLogin(message) {
  logoutBtn.hidden = true;
  app.textContent = '';
  const input = h('input', { id: 'pw', type: 'password', autocomplete: 'current-password', required: true });
  const btn = h('button', { class: 'btn', type: 'submit' }, 'Anmelden');
  const form = h('form', {
    class: 'card stack', style: 'max-width:440px;margin:40px auto 0',
    onsubmit: async (e) => {
      e.preventDefault();
      btn.disabled = true;
      btn.textContent = 'Prüfe…';
      await login(input.value.trim());
      btn.disabled = false;
      btn.textContent = 'Anmelden';
    },
  },
  h('h1', { style: 'font-size:26px' }, 'Lehrerseite'),
  !config.endpoint ? h('p', { class: 'notice warn' }, 'In public/config.json ist noch keine Backend-Adresse eingetragen (siehe DEPLOY.md, Schritt 5).') : null,
  message ? h('p', { class: 'notice bad', role: 'alert' }, message) : null,
  h('div', { class: 'field' }, h('label', { for: 'pw' }, 'Passwort'), input),
  btn);
  app.appendChild(form);
  input.focus();
}

const ERRORS = {
  bad_password: 'Falsches Passwort.',
  no_password_set: 'Im Backend ist noch kein Lehrer-Passwort gespeichert. Siehe DEPLOY.md → „Passwort vergessen“.',
  locked: 'Zu viele Fehlversuche. Bitte 15 Minuten warten.',
  not_configured: 'Backend-Adresse fehlt in public/config.json.',
  network: 'Keine Verbindung zum Backend. Internet prüfen; ist die Web-App bereitgestellt?',
  bad_response: 'Das Backend hat keine gültige Antwort geschickt. Ist die Web-App für „Jeder“ freigegeben?',
};

async function login(pw, silent) {
  try {
    const data = await call(config.endpoint, { action: 'list', password: pw }, 30000);
    sessionStorage.setItem(PW, pw);
    await ingest(data);
    logoutBtn.hidden = false;
    render();
  } catch (e) {
    if (silent && e.code !== 'bad_password') sessionStorage.removeItem(PW);
    renderLogin(ERRORS[e.code] || `Fehler: ${e.code || e.message}`);
  }
}

async function refresh() {
  const pw = sessionStorage.getItem(PW);
  if (!pw) { renderLogin(); return; }
  try {
    await ingest(await call(config.endpoint, { action: 'list', password: pw }, 30000));
    render();
  } catch (e) {
    if (e.code === 'bad_password') { sessionStorage.removeItem(PW); renderLogin(ERRORS.bad_password); return; }
    alert(ERRORS[e.code] || `Fehler: ${e.code}`);
  }
}

async function ingest(data) {
  results = (data.results || []).filter((r) => r.data && r.data.sid);
  grades = new Map((data.grades || []).map((g) => [`${g.sid}|${g.n}`, g]));
  const ids = [...new Set(results.map((r) => r.data.testId))];
  await Promise.all(ids.map(loadDef));
  if (!st.testId || !ids.includes(st.testId)) {
    const newest = results.slice().sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))[0];
    st.testId = newest ? newest.data.testId : (index[0] && index[0].id) || null;
  }
}

// ------------------------------------------------------------------ derived data

function rowsFor() {
  const test = defs[st.testId];
  const q = st.q.trim().toLowerCase();
  const fromTs = st.from ? new Date(st.from + 'T00:00:00').getTime() : 0;
  const list = results.filter((r) => r.data.testId === st.testId &&
    (!fromTs || new Date(r.data.finishedAt).getTime() >= fromTs) &&
    (!q || r.data.name.toLowerCase().includes(q)));
  const count = {};
  list.forEach((r) => { const k = G.normalize(r.data.name); count[k] = (count[k] || 0) + 1; });
  return list.map((r) => {
    const d = r.data;
    const openItems = test ? test.items.filter((it) => it.type === 'open') : [];
    let manual = 0, gradedCount = 0;
    openItems.forEach((it) => {
      const g = grades.get(`${d.sid}|${it.n}`);
      if (g && g.points !== null && g.points !== undefined) { manual += g.points; gradedCount++; }
    });
    const totalMax = d.max + (d.manualMax || 0);
    return {
      r, d, manual, gradedCount, openCount: openItems.length,
      total: d.got + manual, totalMax,
      pct: totalMax ? Math.round(((d.got + manual) / totalMax) * 100) : 0,
      autoPct: d.max ? Math.round((d.got / d.max) * 100) : 0,
      dup: count[G.normalize(d.name)] > 1 ? count[G.normalize(d.name)] : 0,
    };
  });
}

// ------------------------------------------------------------------ main view

function render() {
  app.textContent = '';
  const test = defs[st.testId];
  const rows = rowsFor();
  const testIds = [...new Set(results.map((r) => r.data.testId))];

  const pendingOpen = rows.reduce((s, x) => s + (x.openCount - x.gradedCount), 0);
  const avg = rows.length ? Math.round(rows.reduce((s, x) => s + x.autoPct, 0) / rows.length) : 0;
  const latest = rows.reduce((m, x) => (x.d.finishedAt > m ? x.d.finishedAt : m), '');

  app.appendChild(h('div', { class: 'row', style: 'justify-content:space-between;margin-top:8px' },
    h('h1', { style: 'font-size:26px' }, test ? test.meta.title.pl : 'Ergebnisse'),
    h('div', { class: 'row' },
      h('button', { class: 'btn sm ghost', type: 'button', onclick: refresh }, 'Aktualisieren'),
      h('button', { class: 'btn sm', type: 'button', disabled: !rows.length, onclick: () => exportCsv(rows) }, 'CSV exportieren'))));

  app.appendChild(h('div', { class: 'kpis' },
    kpi(rows.length, 'Abgaben'),
    kpi(rows.length ? `${avg} %` : '–', 'Ø automatische Punkte'),
    kpi(pendingOpen, 'offene Antworten unbewertet'),
    kpi(latest ? fmtDate(latest) : '–', 'letzte Abgabe')));

  app.appendChild(h('div', { class: 'filters' },
    testIds.length > 1 ? h('div', { class: 'field' }, h('label', { for: 'f-test' }, 'Test'),
      h('select', { id: 'f-test', onchange: (e) => { st.testId = e.target.value; render(); } },
        testIds.map((id) => h('option', { value: id, selected: id === st.testId }, defs[id] ? defs[id].meta.title.pl : id)))) : null,
    h('div', { class: 'field' }, h('label', { for: 'f-from' }, 'Abgaben ab'),
      h('input', { id: 'f-from', type: 'date', value: st.from, onchange: (e) => { st.from = e.target.value; render(); } })),
    h('div', { class: 'field' }, h('label', { for: 'f-q' }, 'Name suchen'),
      h('input', { id: 'f-q', type: 'search', value: st.q, oninput: debounce((e) => { st.q = e.target.value; render(); keepFocus('#f-q'); }, 250) }))));

  const tabs = [['results', 'Ergebnisse'], ['open', `Offene Fragen${pendingOpen ? ` (${pendingOpen})` : ''}`], ['stats', 'Auswertung pro Aufgabe']];
  app.appendChild(h('div', { class: 'tabs', role: 'tablist' }, tabs.map(([id, label]) =>
    h('button', {
      type: 'button', role: 'tab', id: 'tab-' + id, 'aria-selected': String(st.tab === id), 'aria-controls': 'panel',
      onclick: () => { st.tab = id; render(); keepFocus('#tab-' + id); },
    }, label))));

  const panel = h('div', { id: 'panel', role: 'tabpanel', 'aria-labelledby': 'tab-' + st.tab, style: 'margin-top:18px' });
  app.appendChild(panel);

  if (!test) { panel.appendChild(h('p', { class: 'notice' }, results.length ? 'Die Testdatei zu diesen Ergebnissen fehlt in public/tests/.' : 'Noch keine Abgaben.')); return; }
  if (!rows.length) { panel.appendChild(h('p', { class: 'notice' }, 'Keine Abgaben für diese Filter.')); return; }

  if (st.tab === 'results') panel.appendChild(viewResults(test, rows));
  else if (st.tab === 'open') panel.appendChild(viewOpen(test, rows));
  else panel.appendChild(viewStats(test, rows));
}

function kpi(v, label) { return h('div', { class: 'kpi' }, h('div', { class: 'v' }, String(v)), h('div', { class: 'l' }, label)); }

function keepFocus(sel) {
  const el = app.querySelector(sel);
  if (!el) return;
  el.focus();
  if (el.setSelectionRange && el.type === 'search') el.setSelectionRange(el.value.length, el.value.length);
}

function debounce(fn, ms) {
  let t;
  return (e) => { clearTimeout(t); t = setTimeout(() => fn(e), ms); };
}

// ------------------------------------------------------------------ results table

function viewResults(test, rows) {
  const secs = test.sections;
  const sorters = {
    name: (x) => x.d.name.toLowerCase(), age: (x) => x.d.age, date: (x) => x.d.finishedAt,
    lang: (x) => x.d.lang, auto: (x) => x.d.got, manual: (x) => x.manual, total: (x) => x.total, pct: (x) => x.pct,
  };
  secs.forEach((s) => { sorters['s' + s.id] = (x) => secOf(x.d, s.id).got; });
  const key = sorters[st.sort] ? st.sort : 'date';
  const sorted = rows.slice().sort((a, b) => {
    const va = sorters[key](a), vb = sorters[key](b);
    return (va < vb ? -1 : va > vb ? 1 : 0) * st.dir;
  });

  const th = (k, label, num) => h('th', { class: num ? 'num' : null, scope: 'col', 'aria-sort': st.sort === k ? (st.dir > 0 ? 'ascending' : 'descending') : null },
    h('button', { type: 'button', onclick: () => { st.dir = st.sort === k ? -st.dir : (k === 'name' ? 1 : -1); st.sort = k; render(); keepFocus(`th button[data-k="${k}"]`); }, 'data-k': k },
      label + (st.sort === k ? (st.dir > 0 ? ' ▲' : ' ▼') : '')));

  return h('div', { class: 'tbl-wrap' }, h('table', { class: 'data' },
    h('thead', null, h('tr', null,
      th('name', 'Name'), th('age', 'Alter', true), th('date', 'Datum'), th('lang', 'Spr.'),
      th('auto', 'Auto', true), th('manual', 'Offen', true), th('total', 'Gesamt', true), th('pct', '%', true),
      secs.map((s) => th('s' + s.id, s.pl, true)))),
    h('tbody', null, sorted.map((x) => h('tr', null,
      h('td', null, x.d.name, x.dup ? h('span', { class: 'badge', title: 'Mehrere Abgaben mit diesem Namen' }, `${x.dup}×`) : null),
      h('td', { class: 'num' }, x.d.age),
      h('td', null, fmtDate(x.d.finishedAt)),
      h('td', null, x.d.lang.toUpperCase()),
      h('td', { class: 'num' }, `${x.d.got}/${x.d.max}`),
      h('td', { class: 'num' }, x.openCount ? (x.gradedCount === x.openCount ? `${fmtNum(x.manual)}/${x.d.manualMax}` : h('span', { class: 'badge' }, `${x.openCount - x.gradedCount} offen`)) : '–'),
      h('td', { class: 'num' }, `${fmtNum(x.total)}/${x.totalMax}`),
      h('td', { class: 'num' }, `${x.pct}`),
      secs.map((s) => { const v = secOf(x.d, s.id); return h('td', { class: 'num' }, `${v.got}/${v.max}`); }))))));
}

function secOf(d, id) { return (d.sections || []).find((s) => s.id === id) || { got: 0, max: 0 }; }
function fmtNum(n) { return String(n).replace('.', ','); }

// ------------------------------------------------------------------ open answers

function viewOpen(test, rows) {
  const openItems = test.items.filter((it) => it.type === 'open');
  if (!openItems.length) return h('p', { class: 'notice' }, 'Dieser Test hat keine offenen Fragen.');
  const cards = [];
  rows.slice().sort((a, b) => a.d.finishedAt.localeCompare(b.d.finishedAt)).forEach((x) => {
    openItems.forEach((it) => {
      const key = `${x.d.sid}|${it.n}`;
      const g = grades.get(key);
      const graded = g && g.points !== null && g.points !== undefined;
      if (st.onlyOpen && graded) return;
      const ans = (x.d.items.find((i) => i.n === it.n) || {}).a;
      cards.push(gradeCard(test, x, it, ans, g));
    });
  });
  return h('div', null,
    h('label', { class: 'row', style: 'margin-bottom:14px;gap:8px;cursor:pointer' },
      h('input', { type: 'checkbox', checked: st.onlyOpen, onchange: (e) => { st.onlyOpen = e.target.checked; render(); keepFocus('#panel input[type=checkbox]'); }, style: 'width:22px;height:22px' }),
      'Nur unbewertete anzeigen'),
    cards.length ? h('div', { class: 'grid-cards' }, cards) : h('p', { class: 'notice good' }, 'Alles bewertet.'));
}

function gradeCard(test, x, it, ans, g) {
  const max = it.manualMax || 0;
  const si = test.sections.findIndex((s) => s.id === it.section);
  const id = `g-${x.d.sid}-${it.n}`;
  // Text field, not type=number: "1,5" must work regardless of the browser's locale.
  const pts = h('input', { id: id + '-p', type: 'text', inputmode: 'decimal', autocomplete: 'off', value: g && g.points !== null ? fmtNum(g.points) : '' });
  const com = h('input', { id: id + '-c', type: 'text', maxlength: '500', value: g ? g.comment : '', placeholder: 'kurzer Kommentar (optional)' });
  const status = h('p', { class: 'help', role: 'status' }, g && g.gradedAt ? `gespeichert ${fmtDate(g.gradedAt)}` : '');
  const save = h('button', { class: 'btn sm', type: 'button' }, 'Speichern');
  save.addEventListener('click', async () => {
    const raw = pts.value.trim().replace(',', '.');
    // Both fields empty = remove the grade; otherwise points are required.
    const p = raw === '' && !com.value.trim() ? null : Number(raw === '' ? NaN : raw);
    if (p !== null && (!/^\d+(\.5|\.0)?$/.test(raw) || p > (max || 100))) {
      status.textContent = `Bitte Punkte von 0 bis ${max} eintragen (halbe Punkte mit Komma, z. B. 1,5).`;
      pts.focus();
      return;
    }
    save.disabled = true;
    status.textContent = 'Speichere…';
    try {
      const res = await call(config.endpoint, { action: 'grade', password: sessionStorage.getItem(PW), sid: x.d.sid, n: it.n, points: p, comment: com.value.trim() });
      if (p === null) grades.delete(`${x.d.sid}|${it.n}`);
      else grades.set(`${x.d.sid}|${it.n}`, { sid: x.d.sid, n: it.n, points: p, comment: com.value.trim(), gradedAt: res.gradedAt });
      status.textContent = p === null ? 'Bewertung entfernt' : `gespeichert: ${fmtNum(p)} P. · ${fmtDate(res.gradedAt)}`;
    } catch (e) {
      status.textContent = ERRORS[e.code] || `Nicht gespeichert (${e.code}).`;
    } finally {
      save.disabled = false;
    }
  });
  pts.addEventListener('keydown', (e) => { if (e.key === 'Enter') save.click(); });
  com.addEventListener('keydown', (e) => { if (e.key === 'Enter') save.click(); });

  return h('div', { class: 'card', style: secStyle(si) },
    h('div', { class: 'row', style: 'justify-content:space-between' },
      h('b', null, `${x.d.name} (${x.d.age})`),
      h('span', { class: 'help' }, `${fmtDate(x.d.finishedAt)} · ${x.d.lang.toUpperCase()}`)),
    h('p', { class: 'help', style: 'margin-top:8px;color:var(--sec);font-weight:700' }, `Aufgabe ${it.n} · ${test.sections[si].pl}`),
    h('p', { style: 'font-weight:700;margin-top:2px' }, it.prompt[x.d.lang] || it.prompt.pl),
    h('div', { class: 'answer' }, typeof ans === 'string' && ans.trim() ? ans : '— keine Antwort —'),
    h('div', { class: 'gradeform' },
      h('div', { class: 'field' }, h('label', { for: id + '-p' }, `Punkte (0–${max})`), pts),
      h('div', { class: 'field' }, h('label', { for: id + '-c' }, 'Kommentar'), com),
      save),
    status);
}

// ------------------------------------------------------------------ per-task analysis

function viewStats(test, rows) {
  const n = rows.length;
  const stats = test.items.filter((it) => it.type !== 'open').map((it) => {
    let got = 0, max = 0, full = 0;
    const wrongAnswers = {};
    const blankHits = it.type === 'table' ? G.tableBlanks(it).map(() => 0) : null;
    let hitSum = 0;
    rows.forEach((x) => {
      const rec = x.d.items.find((i) => i.n === it.n);
      const a = G.sanitizeAnswer(it, rec ? rec.a : undefined);
      const g = G.gradeItem(it, a);
      got += g.got; max += g.max;
      if (g.got === g.max) full++;
      else if (it.type === 'mc' || it.type === 'fill') {
        const k = it.type === 'mc' ? (a === null ? '—' : String(a)) : G.normalize(a) || '—';
        wrongAnswers[k] = (wrongAnswers[k] || 0) + 1;
      }
      if (blankHits) g.cells.forEach((ok, k) => { if (ok) blankHits[k]++; });
      if (it.type === 'order') hitSum += g.hits;
    });
    return { it, rate: max ? got / max : 0, full, wrongAnswers, blankHits, hitSum };
  }).sort((a, b) => a.rate - b.rate || a.it.n - b.it.n);

  const secAvg = test.sections.map((s, i) => {
    const got = rows.reduce((t, x) => t + secOf(x.d, s.id).got, 0);
    const max = rows.reduce((t, x) => t + secOf(x.d, s.id).max, 0);
    return h('div', { class: 'secbar', style: secStyle(i) },
      h('div', { class: 'top' }, h('span', null, s.pl), h('span', null, `${max ? Math.round((got / max) * 100) : 0} %`)),
      h('div', { class: 'track' }, h('i', { style: `width:${max ? (got / max) * 100 : 0}%` })));
  });

  const detail = (x) => {
    const it = x.it;
    if (it.type === 'mc') {
      const top = Object.entries(x.wrongAnswers).sort((a, b) => b[1] - a[1])[0];
      if (!top) return null;
      const label = top[0] === '—' ? 'keine Antwort' : `„${it.options[Number(top[0])].pl}“`;
      return `Häufigste falsche Antwort: ${label} (${top[1]}×) · richtig: „${it.options[it.correct].pl}“`;
    }
    if (it.type === 'fill') {
      const top = Object.entries(x.wrongAnswers).sort((a, b) => b[1] - a[1]).slice(0, 3);
      return top.length ? `Falsche Eingaben: ${top.map(([k, c]) => `„${k}“ (${c}×)`).join(', ')} · richtig: ${it.accept[0]}` : null;
    }
    if (it.type === 'table') {
      return G.tableBlanks(it).map((b, k) => `${it.rows[b.row].name.pl} ${it.columns[b.col].pl}: ${Math.round((x.blankHits[k] / n) * 100)} %`).join(' · ');
    }
    if (it.type === 'order') {
      return `Ø ${fmtNum(Math.round((x.hitSum / n) * 10) / 10)} von ${it.tiles.length} Kacheln an der richtigen Stelle`;
    }
    return null;
  };

  const openStats = test.items.filter((it) => it.type === 'open').map((it) => {
    const pts = rows.map((x) => grades.get(`${x.d.sid}|${it.n}`)).filter((g) => g && g.points !== null && g.points !== undefined).map((g) => g.points);
    return h('div', { class: 'stat', style: secStyle(test.sections.findIndex((s) => s.id === it.section)) },
      h('div', { class: 'n' }, it.n),
      h('div', null, h('div', null, it.prompt.pl),
        h('div', { class: 'det' }, pts.length ? `Ø ${fmtNum(Math.round((pts.reduce((a, b) => a + b, 0) / pts.length) * 10) / 10)} von ${it.manualMax || 0} Punkten (${pts.length} von ${n} bewertet)` : 'noch nicht bewertet')));
  });

  return h('div', null,
    h('div', { class: 'card' },
      h('h2', { style: 'font-size:19px;margin-bottom:12px' }, `Kapitel — Durchschnitt über ${n} ${n === 1 ? 'Kind' : 'Kinder'}`),
      h('div', { class: 'secbars', style: 'margin-top:0' }, secAvg)),
    h('div', { class: 'card', style: 'margin-top:16px' },
      h('h2', { style: 'font-size:19px' }, 'Aufgaben — die schwierigsten zuerst'),
      h('p', { class: 'help', style: 'margin-bottom:6px' }, 'Grün = Anteil der erreichten Punkte. Oben steht, was im Unterricht wiederholt werden sollte.'),
      stats.map((x) => {
        const si = test.sections.findIndex((s) => s.id === x.it.section);
        const d = detail(x);
        return h('div', { class: 'stat', style: secStyle(si) },
          h('div', { class: 'n', title: test.sections[si].pl }, x.it.n),
          h('div', null,
            h('div', { class: 'row', style: 'justify-content:space-between;gap:6px' },
              h('span', null, x.it.prompt.pl),
              h('b', { style: 'font-variant-numeric:tabular-nums' }, `${Math.round(x.rate * 100)} %`)),
            h('div', { class: 'bar', role: 'img', 'aria-label': `${Math.round(x.rate * 100)} % der Punkte` }, h('i', { style: `width:${x.rate * 100}%` })),
            h('div', { class: 'det' }, `${x.full} von ${n} komplett richtig${d ? ' · ' + d : ''}`)));
      })),
    openStats.length ? h('div', { class: 'card', style: 'margin-top:16px' }, h('h2', { style: 'font-size:19px' }, 'Offene Fragen'), openStats) : null);
}

// ------------------------------------------------------------------ CSV

function exportCsv(rows) {
  const test = defs[st.testId];
  const items = test.items;
  const open = items.filter((it) => it.type === 'open');
  const head = ['Name', 'Alter', 'Datum', 'Sprache', 'Auto-Punkte', 'Auto-Max', 'Offene Punkte', 'Offene Max', 'Gesamt', 'Gesamt-Max', 'Prozent',
    ...test.sections.map((s) => `${s.pl} (von ${rows[0] ? secOf(rows[0].d, s.id).max : ''})`),
    ...items.filter((it) => it.type !== 'open').map((it) => `A${it.n}`),
    ...open.flatMap((it) => [`A${it.n} Antwort`, `A${it.n} Punkte`, `A${it.n} Kommentar`]),
    'ID'];
  const lines = [head];
  rows.slice().sort((a, b) => a.d.finishedAt.localeCompare(b.d.finishedAt)).forEach((x) => {
    const d = x.d;
    const byN = (n) => d.items.find((i) => i.n === n) || {};
    lines.push([
      d.name, d.age, fmtDate(d.finishedAt), d.lang, d.got, d.max, fmtNum(x.manual), d.manualMax || 0, fmtNum(x.total), x.totalMax, x.pct,
      ...test.sections.map((s) => secOf(d, s.id).got),
      ...items.filter((it) => it.type !== 'open').map((it) => (byN(it.n).g === undefined ? '' : byN(it.n).g)),
      ...open.flatMap((it) => {
        const g = grades.get(`${d.sid}|${it.n}`);
        return [byN(it.n).a || '', g && g.points !== null ? fmtNum(g.points) : '', g ? g.comment : ''];
      }),
      d.sid,
    ]);
  });
  // Semicolons + BOM so Excel with German/Polish settings opens it with umlauts and ą/ę intact.
  const csv = '﻿' + lines.map((row) => row.map(cell).join(';')).join('\r\n');
  const a = h('a', { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })), download: `${test.meta.id}-ergebnisse-${new Date().toISOString().slice(0, 10)}.csv` });
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

function cell(v) {
  let s = String(v == null ? '' : v);
  if (/^[=+\-@]/.test(s)) s = "'" + s;   // no formulas when opened in Excel
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
