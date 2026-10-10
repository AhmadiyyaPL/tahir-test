// Student page: start → one task per screen → review → result + automatic sending.
// The running test lives in localStorage (key SESSION) after every keystroke, so a
// reload or a browser restart continues where the child stopped.

import { T } from './i18n.js';
import * as store from './store.js';
import * as G from './grading.js';
import * as outbox from './outbox.js';
import { loadConfig } from './api.js';
import { h, secStyle, fmtDate, fetchJSON, copyText, toggleTheme, isDark, syncThemeColor, registerServiceWorker } from './dom.js';

const SESSION = 'ta.session.v1';
const LANG = 'ta.lang';
const LAST_TEST = 'ta.lastTest';

const app = document.getElementById('app');
const langBtn = document.getElementById('lang-toggle');
const themeBtn = document.getElementById('theme-toggle');
const netbar = document.getElementById('netbar');
const desk = !!(window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches);

let lang = T[store.get(LANG, 'pl')] ? store.get(LANG, 'pl') : 'pl';
let tests = [];
const testCache = {};
let test = null;
let session = null;
// Transient UI state that does not need to survive a reload.
let ui = { testId: null, name: '', age: '', dupArmed: false, discardArmed: false, copyMsg: null, focus: null };

const t = () => T[lang];
const N = () => test.items.length;
const secIndex = (id) => Math.max(0, test.sections.findIndex((s) => s.id === id));
const itemAt = (i) => test.items[i];

// ---------------------------------------------------------------- boot

boot();

async function boot() {
  registerServiceWorker();
  paintChrome();
  langBtn.addEventListener('click', () => setLang(lang === 'pl' ? 'en' : 'pl'));
  themeBtn.addEventListener('click', () => { toggleTheme(); paintChrome(); });
  window.addEventListener('online', paintNet);
  window.addEventListener('offline', paintNet);
  outbox.onChange(onOutboxChange);
  outbox.start();
  loadConfig();

  try {
    const index = await fetchJSON('tests/index.json');
    tests = (index.tests || []).filter((x) => x.active !== false);
    if (!tests.length) throw new Error('no tests');

    const saved = store.get(SESSION, null);
    if (saved && tests.some((x) => x.id === saved.testId)) {
      test = await loadTest(saved.testId);
      session = restoreSession(saved);
    }
    if (!test) {
      const last = store.get(LAST_TEST, null);
      ui.testId = tests.some((x) => x.id === last) ? last : tests[0].id;
      test = await loadTest(ui.testId);
    } else {
      ui.testId = test.meta.id;
    }
  } catch (e) {
    renderError();
    return;
  }
  paintNet();
  render();
}

async function loadTest(id) {
  if (!testCache[id]) {
    const entry = tests.find((x) => x.id === id);
    testCache[id] = await fetchJSON('tests/' + entry.file);
  }
  return testCache[id];
}

function restoreSession(saved) {
  const answers = {};
  test.items.forEach((it) => { answers[it.n] = G.sanitizeAnswer(it, saved.answers ? saved.answers[it.n] : undefined); });
  const s = Object.assign({}, saved, { answers });
  s.idx = Math.min(Math.max(0, s.idx | 0), test.items.length - 1);
  // An unfinished test first shows the resume card instead of dropping into a task.
  s.resumePrompt = s.phase !== 'done';
  return s;
}

function saveSession() { if (session) store.set(SESSION, session); }

function setLang(next) {
  lang = next;
  store.set(LANG, lang);
  if (session && session.phase !== 'done') { session.lang = lang; saveSession(); }
  paintChrome();
  render(true);
}

function paintChrome() {
  document.documentElement.lang = t().htmlLang;
  langBtn.textContent = t().switchTo;
  langBtn.setAttribute('aria-label', t().switchLabel);
  themeBtn.setAttribute('aria-label', isDark() ? t().themeLight : t().themeDark);
  syncThemeColor();
  paintNet();
}

function paintNet() {
  netbar.hidden = navigator.onLine !== false;
  netbar.textContent = t().offline;
}

// ---------------------------------------------------------------- render

// keepFocus: re-render in place (language switch) without moving focus to the heading.
function render(keepFocus) {
  app.textContent = '';
  if (!session) app.appendChild(viewStart());
  else if (session.resumePrompt) app.appendChild(viewStartResume());
  else if (session.phase === 'quiz') app.appendChild(viewQuiz());
  else if (session.phase === 'review') app.appendChild(viewReview());
  else app.appendChild(viewDone());

  if (ui.focus) {
    const el = app.querySelector(ui.focus);
    ui.focus = null;
    if (el) el.focus();
  } else if (!keepFocus) {
    const head = app.querySelector('[data-autofocus]');
    if (head) head.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
}

function renderError() {
  app.textContent = '';
  app.appendChild(h('div', { class: 'stack', style: 'padding-top:30px' },
    h('p', { class: 'notice bad', role: 'alert' }, t().loadFail),
    h('button', { class: 'btn', type: 'button', onclick: () => location.reload() }, t().reload)));
}

// ---------------------------------------------------------------- start screen

function viewStart() {
  const s = t();
  const root = h('div', { class: 'start' });

  root.appendChild(h('div', { class: 'hero' },
    h('div', { class: 'eyebrow' }, test.meta.subtitle ? test.meta.subtitle[lang] : 'Tahir Academy'),
    h('h1', { tabindex: '-1', 'data-autofocus': true }, test.meta.title[lang]),
    h('div', { class: 'secdots' }, test.sections.map((sec, i) =>
      h('span', { style: secStyle(i) }, h('i'), sec[lang])))));

  const waiting = outbox.pending();
  if (waiting.length) {
    root.appendChild(h('div', { class: 'notice warn', role: 'status', style: 'margin-bottom:16px' },
      s.pendingNote(waiting.length),
      h('div', { class: 'row' }, h('button', { class: 'btn sm ghost', type: 'button', onclick: () => outbox.flush(true) }, s.sendNow))));
  }

  const card = h('div', { class: 'card stack' });

  if (tests.length > 1) {
    card.appendChild(h('fieldset', { class: 'field', style: 'border:0;padding:0;margin:0' },
      h('legend', { class: 'label', style: 'margin-bottom:6px' }, s.chooseTest),
      h('div', { class: 'testpick' }, tests.map((x) =>
        h('label', null,
          h('input', { type: 'radio', name: 'test', value: x.id, checked: x.id === ui.testId, onchange: () => pickTest(x.id) }),
          h('span', { class: 'box' }, h('b', null, x.title[lang]),
            h('small', null, x.subtitle ? x.subtitle[lang] : `${x.items} · ${x.pointsMax} pkt`)))))));
  }

  card.appendChild(h('div', { class: 'field' },
    h('span', { class: 'label', id: 'lang-label' }, s.langLabel),
    h('div', { class: 'seg', role: 'group', 'aria-labelledby': 'lang-label' },
      h('button', { type: 'button', 'aria-pressed': String(lang === 'pl'), lang: 'pl', onclick: () => setLang('pl') }, 'Polski'),
      h('button', { type: 'button', 'aria-pressed': String(lang === 'en'), lang: 'en', onclick: () => setLang('en') }, 'English'))));

  const startBtn = h('button', { class: 'btn', type: 'button', id: 'start-btn', onclick: onStart }, ui.dupArmed ? s.startAnyway : s.start);
  const dupBox = h('div', { class: 'notice warn', id: 'dup', role: 'alert', hidden: !ui.dupArmed }, ui.dupArmed ? s.dupWarn(ui.dupInfo.name, ui.dupInfo.date) : '');
  const ready = () => { startBtn.disabled = !(ui.name.trim() && ui.age); };

  const nameInput = h('input', {
    id: 'f-name', type: 'text', autocomplete: 'off', autocapitalize: 'words', spellcheck: 'false',
    maxlength: '40', placeholder: s.namePh, value: ui.name, 'aria-describedby': 'f-name-help',
    oninput: (e) => {
      ui.name = e.target.value;
      if (ui.dupArmed) { ui.dupArmed = false; dupBox.hidden = true; startBtn.textContent = s.start; }
      ready();
    },
    onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('f-age').focus(); } },
  });
  card.appendChild(h('div', { class: 'field' },
    h('label', { for: 'f-name' }, s.nameLabel), nameInput, h('span', { class: 'help', id: 'f-name-help' }, s.nameHelp)));

  const ages = [];
  for (let a = 6; a <= 16; a++) ages.push(h('option', { value: String(a), selected: String(a) === ui.age }, String(a)));
  card.appendChild(h('div', { class: 'field' },
    h('label', { for: 'f-age' }, s.ageLabel),
    h('select', { id: 'f-age', onchange: (e) => { ui.age = e.target.value; ready(); } },
      h('option', { value: '' }, '—'), ages)));

  card.appendChild(dupBox);
  card.appendChild(startBtn);
  ready();

  const rules = h('ul', { class: 'rules' }, s.rules(test.items.length, test.sections.length).map((r, i) =>
    h('li', null, h('b', { 'aria-hidden': 'true' }, i + 1), h('span', null, r))));

  root.appendChild(card);
  root.appendChild(rules);
  return root;
}

async function pickTest(id) {
  ui.testId = id;
  store.set(LAST_TEST, id);
  try { test = await loadTest(id); } catch (e) { renderError(); return; }
  render(true);
}

function findDuplicate(name, testId) {
  const key = G.normalize(name);
  const hit = outbox.sent().find((x) => x.testId === testId && G.normalize(x.name) === key) ||
    outbox.pending().map((x) => ({ name: x.submission.name, testId: x.submission.testId, at: x.submission.finishedAt }))
      .find((x) => x.testId === testId && G.normalize(x.name) === key);
  return hit ? { name: hit.name, date: fmtDate(hit.at) } : null;
}

function onStart() {
  const name = ui.name.trim().replace(/\s+/g, ' ');
  if (!name || !ui.age) return;
  if (!ui.dupArmed) {
    const dup = findDuplicate(name, test.meta.id);
    if (dup) {
      ui.dupArmed = true;
      ui.dupInfo = dup;
      ui.focus = '#dup';
      render(true);
      const box = document.getElementById('dup');
      if (box) { box.setAttribute('tabindex', '-1'); box.focus(); }
      return;
    }
  }
  const answers = {};
  test.items.forEach((it) => { answers[it.n] = G.blankAnswer(it); });
  session = {
    v: 1, sid: store.uuid(), testId: test.meta.id, name, age: Number(ui.age), lang,
    answers, idx: 0, startedAt: new Date().toISOString(), phase: 'quiz',
  };
  store.set(LAST_TEST, test.meta.id);
  ui.dupArmed = false;
  saveSession();
  render();
}

// ---------------------------------------------------------------- quiz

function viewQuiz() {
  const s = t();
  const item = itemAt(session.idx);
  const si = secIndex(item.section);
  const sec = test.sections[si];
  const root = h('div', { style: secStyle(si) });

  root.appendChild(h('div', { class: 'rail' },
    h('div', { class: 'railtop' },
      h('span', { class: 'sectag' }, sec[lang]),
      h('span', { class: 'count' }, `${s.task} ${session.idx + 1} ${s.of} ${N()}`)),
    h('div', {
      class: 'prog', role: 'progressbar', 'aria-valuemin': '1', 'aria-valuemax': String(N()),
      'aria-valuenow': String(session.idx + 1), 'aria-label': `${session.idx + 1} / ${N()}`,
    }, test.items.map((it, i) => h('i', {
      class: i === session.idx ? 'cur' : (G.isAnswered(it, session.answers[it.n]) ? 'done' : ''),
      style: secStyle(secIndex(it.section)),
    })))));

  const help = item.help ? item.help[lang] : null;
  const ptsPill = item.points > 0 ? s.pts(item.points) : (item.manualMax ? s.pts(item.manualMax) : null);
  const q = h('article', { class: 'q', 'aria-labelledby': 'q-title' },
    h('p', { class: 'qnum' }, `${s.task} ${item.n}`, ptsPill ? h('span', { class: 'pill' }, ptsPill) : null),
    h('h1', { class: 'qtext', id: 'q-title', tabindex: '-1', 'data-autofocus': true }, item.prompt[lang]),
    help ? h('p', { class: 'qsub', id: 'q-help' }, help) : null);

  const body = h('div', { class: 'qbody' + (desk ? ' desk' : '') });
  q.appendChild(body);
  paintBody(body, item);
  root.appendChild(q);

  const nextBtn = h('button', { class: 'btn', type: 'button', id: 'next-btn', onclick: goNext }, s.next);
  const prevBtn = h('button', { class: 'btn ghost', type: 'button', disabled: session.idx === 0, onclick: goPrev }, s.prev);
  root.appendChild(h('div', { class: 'nav' }, prevBtn, nextBtn));
  root.appendChild(h('p', { class: 'hint', id: 'hint', 'aria-live': 'polite' }));
  queueMicrotask(refreshNav);
  return root;
}

function refreshNav() {
  const btn = document.getElementById('next-btn');
  const hint = document.getElementById('hint');
  if (!btn || !session || session.phase !== 'quiz') return;
  const item = itemAt(session.idx);
  const ok = G.isAnswered(item, session.answers[item.n]);
  btn.disabled = !ok;
  const hints = t().hint;
  hint.textContent = ok ? '' : (item.type === 'order' && desk ? hints.orderDesk : hints[item.type]);
}

function setAnswer(item, value) {
  session.answers[item.n] = value;
  saveSession();
  refreshNav();
  const bar = app.querySelectorAll('.prog i')[session.idx];
  if (bar) bar.className = 'cur';
}

function goNext() {
  const item = itemAt(session.idx);
  if (!G.isAnswered(item, session.answers[item.n])) return;
  if (session.idx < N() - 1) session.idx++;
  else session.phase = 'review';
  saveSession();
  render();
}

function goPrev() {
  if (session.idx > 0) { session.idx--; saveSession(); render(); }
}

function paintBody(body, item) {
  body.textContent = '';
  const v = session.answers[item.n];
  const fn = { mc: bodyMc, fill: bodyFill, order: bodyOrder, table: bodyTable, open: bodyOpen }[item.type];
  if (fn) body.appendChild(fn(item, v, body));
}

function bodyMc(item, v) {
  const letters = 'ABCDEFGH';
  return h('div', { class: 'opts', role: 'radiogroup', 'aria-labelledby': 'q-title' }, item.options.map((o, k) =>
    h('label', { class: 'opt' },
      h('input', { type: 'radio', name: 'mc-' + item.n, value: String(k), checked: v === k, onchange: () => setAnswer(item, k) }),
      h('span', { class: 'box' }, h('span', { class: 'key', 'aria-hidden': 'true' }, letters[k]), h('span', null, o[lang])))));
}

function bodyFill(item, v) {
  const input = h('input', {
    type: 'text', inputmode: 'numeric', autocomplete: 'off', maxlength: '12', id: 'fill-' + item.n,
    value: v || '', 'aria-labelledby': 'q-title',
    oninput: (e) => setAnswer(item, e.target.value),
    onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); goNext(); } },
  });
  return h('div', { class: 'fillrow' }, input, item.unit ? h('span', { class: 'unit' }, item.unit[lang]) : null);
}

function bodyOpen(item, v) {
  return h('textarea', {
    id: 'open-' + item.n, maxlength: '1000', rows: '5', value: v || '', placeholder: t().hint.open,
    'aria-labelledby': 'q-title', oninput: (e) => setAnswer(item, e.target.value),
  });
}

function bodyTable(item, v) {
  const blanks = G.tableBlanks(item);
  const head = h('tr', null, h('th', { scope: 'col' }, h('span', { class: 'sr' }, '—')),
    item.columns.map((c) => h('th', { scope: 'col' }, c[lang])));
  const rows = item.rows.map((row, r) => h('tr', null,
    h('th', { scope: 'row' }, row.name[lang]),
    row.cells.map((cell, c) => {
      if (cell !== null) return h('td', { class: 'given' }, cell);
      const k = blanks.findIndex((b) => b.row === r && b.col === c);
      const input = h('input', {
        type: 'text', inputmode: 'numeric', maxlength: '2', autocomplete: 'off', id: `tbl-${item.n}-${k}`,
        value: v[k] || '', 'aria-label': `${row.name[lang]} — ${item.columns[c][lang]}`,
        oninput: (e) => {
          const clean = e.target.value.replace(/[^0-9]/g, '');
          if (clean !== e.target.value) e.target.value = clean;
          const next = session.answers[item.n].slice();
          next[k] = clean;
          setAnswer(item, next);
        },
        onkeydown: (e) => {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          const nx = document.getElementById(`tbl-${item.n}-${k + 1}`);
          if (nx) nx.focus(); else goNext();
        },
      });
      return h('td', null, input);
    })));
  return h('div', { class: 'tablewrap' }, h('table', { class: 'rak' }, h('thead', null, head), h('tbody', null, rows)));
}

// Ordering: tap gives the next number, tapping again takes it back (later tiles move
// up). On a desktop the chosen sequence can also be rearranged by drag & drop or with
// the arrow buttons; phones keep to tapping only.
function bodyOrder(item, v, body) {
  const s = t();
  const seq = v.slice();
  const commit = (next, focusSel) => {
    setAnswer(item, next);
    paintBody(body, item);
    if (focusSel) { const el = body.querySelector(focusSel); if (el) el.focus(); }
  };
  const place = (k, beforeK) => {
    const next = seq.filter((x) => x !== k);
    const at = beforeK === undefined ? -1 : next.indexOf(beforeK);
    if (at < 0) next.push(k); else next.splice(at, 0, k);
    commit(next);
  };
  let dragK = null;
  const dragAttrs = (k) => (desk ? {
    draggable: 'true',
    ondragstart: (e) => { dragK = k; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(k)); e.currentTarget.classList.add('dragging'); },
    ondragend: (e) => { e.currentTarget.classList.remove('dragging'); },
  } : {});

  const tiles = h('div', {
    class: 'tiles',
    ondragover: desk ? (e) => e.preventDefault() : null,
    ondrop: desk ? (e) => { e.preventDefault(); if (dragK !== null && seq.indexOf(dragK) >= 0) commit(seq.filter((x) => x !== dragK)); } : null,
  }, item.tiles.map((tile, k) => {
    const pos = seq.indexOf(k);
    return h('button', Object.assign({
      class: 'tile', type: 'button', 'data-k': String(k), 'aria-pressed': String(pos >= 0),
      'aria-label': `${tile[lang]} — ${pos >= 0 ? s.tilePos(pos + 1) : s.tileFree}`,
      onclick: () => commit(pos >= 0 ? seq.filter((x) => x !== k) : seq.concat([k]), `.tile[data-k="${k}"]`),
    }, dragAttrs(k)), h('span', { class: 'pin', 'aria-hidden': 'true' }, pos >= 0 ? pos + 1 : ''), h('span', null, tile[lang]));
  }));

  const move = (k, dir) => {
    const i = seq.indexOf(k), j = i + dir;
    if (j < 0 || j >= seq.length) return;
    const next = seq.slice();
    next[i] = seq[j]; next[j] = k;
    commit(next, `.seq li[data-k="${k}"] button[data-dir="${dir}"]`);
  };

  const list = h('ol', {
    ondragover: desk ? (e) => e.preventDefault() : null,
    ondrop: desk ? (e) => { e.preventDefault(); if (dragK !== null) place(dragK); } : null,
  }, seq.length ? seq.map((k, i) => h('li', Object.assign({
    'data-k': String(k),
    ondragover: desk ? (e) => { e.preventDefault(); e.currentTarget.classList.add('over'); } : null,
    ondragleave: desk ? (e) => e.currentTarget.classList.remove('over') : null,
    ondrop: desk ? (e) => { e.preventDefault(); e.stopPropagation(); if (dragK !== null && dragK !== k) place(dragK, k); } : null,
  }, dragAttrs(k)),
  h('b', null, i + 1), h('span', null, item.tiles[k][lang]),
  h('span', { class: 'mv' },
    h('button', { type: 'button', 'data-dir': '-1', 'aria-label': `${s.moveUp}: ${item.tiles[k][lang]}`, disabled: i === 0, onclick: () => move(k, -1) }, '↑'),
    h('button', { type: 'button', 'data-dir': '1', 'aria-label': `${s.moveDown}: ${item.tiles[k][lang]}`, disabled: i === seq.length - 1, onclick: () => move(k, 1) }, '↓'))))
    : h('li', { class: 'empty' }, s.orderEmpty));

  return h('div', null,
    tiles,
    h('div', { class: 'seq' }, h('h3', null, s.yourOrder), list),
    h('div', { class: 'toolrow' },
      h('span', { class: 'help' }, `${seq.length} / ${item.tiles.length}`),
      h('button', { class: 'btn sm quiet', type: 'button', disabled: !seq.length, onclick: () => commit([], '.tile') }, s.clear)));
}

// ---------------------------------------------------------------- review & submit

function viewReview() {
  const s = t();
  return h('div', { class: 'stack', style: 'padding-top:24px' },
    h('div', { class: 'card stack' },
      h('h1', { tabindex: '-1', 'data-autofocus': true, style: 'font-size:30px' }, s.reviewTitle),
      h('p', null, s.reviewText(N())),
      h('p', { class: 'notice warn' }, s.reviewWarn),
      h('div', { class: 'nav', style: 'margin-top:4px' },
        h('button', { class: 'btn ghost', type: 'button', onclick: () => { session.phase = 'quiz'; session.idx = N() - 1; saveSession(); render(); } }, s.backToTasks),
        h('button', { class: 'btn', type: 'button', onclick: submit }, s.submit))));
}

function submit() {
  const r = G.gradeTest(test, session.answers);
  const submission = {
    v: 1,
    sid: session.sid,
    testId: test.meta.id,
    name: session.name,
    age: session.age,
    lang,
    startedAt: session.startedAt,
    finishedAt: new Date().toISOString(),
    got: r.got,
    max: r.max,
    manualMax: r.manualMax,
    sections: r.sections.map((x) => ({ id: x.id, got: x.got, max: x.max })),
    items: r.items.map((x) => ({ n: x.n, a: x.answer, g: x.got, m: x.max })),
  };
  session.phase = 'done';
  session.submission = submission;
  saveSession();
  outbox.enqueue(submission);
  render();
}

// ---------------------------------------------------------------- result

function viewDone() {
  const s = t();
  const sub = session.submission;
  const r = G.gradeTest(test, session.answers);
  const band = r.pct >= 90 ? 3 : r.pct >= 75 ? 2 : r.pct >= 55 ? 1 : 0;
  const root = h('div');

  root.appendChild(h('section', { class: 'score', 'aria-labelledby': 'score-h' },
    h('div', { class: 'eyebrow' }, `${sub.name} · ${sub.age}`),
    h('h1', { id: 'score-h', class: 'sr' }, s.scoreLabel),
    h('div', { class: 'big', tabindex: '-1', 'data-autofocus': true }, String(r.got), h('small', null, ` / ${r.max}`)),
    h('p', { class: 'pct' }, `${r.pct}% ${s.pctLabel}`),
    h('p', { class: 'msg' }, s.band[band]),
    r.manualMax ? h('p', { class: 'help', style: 'margin-top:6px' }, s.openExtra(r.manualMax)) : null));

  root.appendChild(h('div', { class: 'secbars' }, r.sections.map((x) => {
    const i = secIndex(x.id);
    const pct = x.max ? Math.round((x.got / x.max) * 100) : 0;
    return h('div', { class: 'secbar', style: secStyle(i) },
      h('div', { class: 'top' }, h('span', null, test.sections[i][lang]), h('span', null, `${x.got} / ${x.max}`)),
      h('div', { class: 'track', role: 'img', 'aria-label': `${pct}%` }, h('i', { style: `width:${pct}%` })));
  })));

  root.appendChild(h('div', { id: 'sendcard', class: 'card sendcard' }));
  queueMicrotask(paintSendCard);

  // What to learn from: wrong and partly right answers with the correct solution.
  const wrong = r.items.filter((x) => x.status === 'wrong' || x.status === 'part');
  const open = r.items.filter((x) => x.status === 'manual');
  const right = r.items.filter((x) => x.status === 'full');
  const byN = (n) => test.items.find((it) => it.n === n);

  root.appendChild(h('h2', { class: 'sh' }, s.toFix));
  if (!wrong.length) root.appendChild(h('p', { class: 'notice good' }, s.allCorrect));
  root.appendChild(h('div', { class: 'rev' }, wrong.map((x) => {
    const it = byN(x.n);
    return h('div', { class: 'item ' + x.status, style: secStyle(secIndex(it.section)) },
      h('p', { class: 'q' }, `${it.n}. ${it.prompt[lang]}`, h('small', null, s.partial(x.got, x.max))),
      h('div', { class: 'a' },
        h('span', { class: 'yours' }, `${s.yourAns} ${G.describeAnswer(it, x.answer, lang)}`),
        h('span', { class: 'right' }, `${s.correctAns} ${G.describeCorrect(it, lang)}`)));
  })));

  if (open.length) {
    root.appendChild(h('h2', { class: 'sh' }, s.openHead));
    root.appendChild(h('div', { class: 'rev' }, open.map((x) => {
      const it = byN(x.n);
      return h('div', { class: 'item manual', style: secStyle(secIndex(it.section)) },
        h('p', { class: 'q' }, `${it.n}. ${it.prompt[lang]}`),
        h('div', { class: 'a' }, h('span', null, G.describeAnswer(it, x.answer, lang))));
    })));
  }

  if (right.length) {
    root.appendChild(h('details', { class: 'more' },
      h('summary', null, s.correctHead(right.length)),
      h('div', { class: 'rev' }, right.map((x) => {
        const it = byN(x.n);
        return h('div', { class: 'item full' },
          h('p', { class: 'q' }, `${it.n}. ${it.prompt[lang]}`),
          h('div', { class: 'a' }, h('span', { class: 'right' }, G.describeAnswer(it, x.answer, lang))));
      }))));
  }

  root.appendChild(h('div', { class: 'nextchild' },
    h('button', { class: 'btn ghost', type: 'button', onclick: nextChild }, s.nextChild)));
  return root;
}

function paintSendCard() {
  const box = document.getElementById('sendcard');
  if (!box || !session || !session.submission) return;
  const s = t();
  const st = outbox.statusOf(session.sid);
  let state = st.state;
  if (state === 'rejected' && st.error === 'not_configured') state = 'notConfigured';
  const sent = state === 'sent';

  const icon = sent ? '✓' : (state === 'sending' || state === 'queued') ? h('span', { class: 'spin', 'aria-hidden': 'true' }) : '!';
  const msg = sent ? s.send.sent : (s.send[state] || s.send.queued);
  const sub = sent ? s.sentAt(fmtDate(st.at)) : null;

  box.textContent = '';
  box.appendChild(h('div', { class: 'sendstate ' + (state === 'notConfigured' ? 'rejected' : state), role: 'status', 'aria-live': 'polite' },
    h('span', { class: 'ic', 'aria-hidden': 'true' }, icon),
    h('span', null, msg, sub ? h('span', { class: 'sub' }, sub) : null)));

  if (!sent) {
    if (state !== 'sending' && state !== 'queued') {
      box.appendChild(h('div', { class: 'row', style: 'margin-top:12px' },
        h('button', { class: 'btn sm ghost', type: 'button', onclick: () => outbox.flush(true) }, s.retry)));
    }
    const failedHard = state === 'rejected' || state === 'notConfigured' || (st.state === 'retrying' && retries() >= 2);
    const code = h('pre', { class: 'codebox', id: 'summary' }, summaryText());
    const toast = h('p', { class: 'help', role: 'status' }, ui.copyMsg || '');
    box.appendChild(h('details', { class: 'fallback', open: failedHard },
      h('summary', null, s.fallbackTitle),
      h('p', { class: 'help' }, s.fallbackText),
      code,
      h('button', {
        class: 'btn sm', type: 'button',
        onclick: async () => {
          const ok = await copyText(code.textContent, code);
          ui.copyMsg = ok ? s.copied : s.copyFail;
          toast.textContent = ui.copyMsg;
        },
      }, s.copy),
      toast));
  }

  box.appendChild(h('div', { class: 'nextchild' },
    h('button', { class: 'btn', type: 'button', onclick: nextChild }, s.nextChild),
    h('p', { class: 'help', style: 'margin-top:8px' }, sent ? s.nextChildNote : s.nextChildPending)));
}

function retries() {
  const p = outbox.pending().find((x) => x.sid === session.sid);
  return p ? p.tries : 0;
}

function onOutboxChange() {
  if (session && session.phase === 'done') paintSendCard();
}

function summaryText() {
  const s = t(), sub = session.submission, L = s.sum;
  const r = G.gradeTest(test, session.answers);
  const lines = [
    `TAHIR ACADEMY — ${test.meta.title[lang]}`,
    `${L.name}: ${sub.name}`,
    `${L.age}: ${sub.age}`,
    `${L.date}: ${fmtDate(sub.finishedAt)}`,
    `${L.score}: ${r.got}/${r.max} (${r.pct}%)`,
    r.sections.map((x) => `${test.sections[secIndex(x.id)][lang]} ${x.got}/${x.max}`).join(' · '),
    `${L.wrong}: ${r.wrong.length ? r.wrong.join(', ') : L.none}`,
  ];
  const open = test.items.filter((it) => it.type === 'open');
  if (open.length) {
    lines.push('', L.open);
    open.forEach((it) => { lines.push(`${it.n}. ${it.prompt[lang]}`, `→ ${G.describeAnswer(it, session.answers[it.n], lang)}`); });
  }
  lines.push('', `${L.id}: ${sub.sid}`);
  return lines.join('\n');
}

function nextChild() {
  store.remove(SESSION);
  session = null;
  ui = { testId: test.meta.id, name: '', age: '', dupArmed: false, discardArmed: false, copyMsg: null, focus: '#f-name' };
  render();
  window.scrollTo(0, 0);
}

// ---------------------------------------------------------------- resume card on start screen

// When a test is in progress, the start screen only offers "continue" or "discard",
// so a sibling cannot overwrite someone else's unfinished answers by accident.
function viewStartResume() {
  const s = t();
  const root = viewStart();
  const card = root.querySelector('.card');
  const rules = root.querySelector('.rules');
  if (rules) rules.remove();
  const resume = h('div', { class: 'card stack' },
    h('h2', { style: 'font-size:21px' }, s.resumeTitle),
    h('p', null, s.resumeLine(session.name, session.idx + 1, N())),
    ui.discardArmed ? h('p', { class: 'notice warn', role: 'alert' }, s.discardConfirm) : null,
    h('div', { class: 'row' },
      h('button', { class: 'btn', type: 'button', id: 'resume-btn', onclick: () => { session.resumePrompt = false; ui.discardArmed = false; render(); } }, s.resume),
      h('button', {
        class: ui.discardArmed ? 'btn danger' : 'btn quiet', type: 'button', id: 'discard-btn',
        onclick: () => {
          if (!ui.discardArmed) { ui.discardArmed = true; ui.focus = '#discard-btn'; render(true); return; }
          store.remove(SESSION);
          session = null;
          ui.discardArmed = false;
          ui.focus = '#f-name';
          render();
        },
      }, ui.discardArmed ? s.discardYes : s.discard)));
  card.replaceWith(resume);
  return root;
}
