// Runs the real backend/Code.gs against in-memory fakes (tools/gas-mock.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as G from '../public/js/grading.js';
import { createBackend } from '../tools/gas-mock.js';

const PART1 = JSON.parse(fs.readFileSync(new URL('../public/tests/czesc-1.json', import.meta.url), 'utf8'));

// Built exactly like submit() in public/js/student.js.
function submission(name, answers = {}) {
  const r = G.gradeTest(PART1, answers);
  return {
    v: 1, sid: crypto.randomUUID(), testId: PART1.meta.id, name, age: 10, lang: 'pl',
    startedAt: new Date(Date.now() - 600000).toISOString(), finishedAt: new Date().toISOString(),
    got: r.got, max: r.max, manualMax: r.manualMax,
    sections: r.sections.map((x) => ({ id: x.id, got: x.got, max: x.max })),
    items: r.items.map((x) => ({ n: x.n, a: x.answer, g: x.got, m: x.max })),
  };
}

function fresh() {
  const b = createBackend();
  b.setup('lehrer-passwort');
  return b;
}

test('submit stores one row with readable columns', () => {
  const b = fresh();
  const s = submission('Adam', { 1: 1, 17: 'Bo trzeba być czystym.' });
  assert.deepEqual(b.post({ action: 'submit', token: b.token(), submission: s }), { ok: true });
  const rows = b.ss.getSheetByName('Ergebnisse').data;
  assert.equal(rows.length, 2);
  const row = rows[1];
  assert.equal(row[1], s.sid);
  assert.equal(row[3], 'Adam');
  assert.equal(row[8], 1);
  assert.equal(row[9], 40);
  assert.equal(row[12], '17: Bo trzeba być czystym.\n35: ');
  assert.deepEqual(JSON.parse(row[13]), s);
});

test('a retried submission is stored only once', () => {
  const b = fresh();
  const s = submission('Ola');
  b.post({ action: 'submit', token: b.token(), submission: s });
  assert.deepEqual(b.post({ action: 'submit', token: b.token(), submission: s }), { ok: true, duplicate: true });
  assert.equal(b.ss.getSheetByName('Ergebnisse').data.length, 2);
});

test('wrong token and malformed data are rejected', () => {
  const b = fresh();
  assert.equal(b.post({ action: 'submit', token: 'nope', submission: submission('X') }).error, 'bad_token');
  const bad = submission('X');
  bad.got = 99;
  assert.equal(b.post({ action: 'submit', token: b.token(), submission: bad }).error, 'invalid');
  assert.equal(b.post('not json').error, 'bad_json');
  assert.equal(b.post({ action: 'drop_tables' }).error, 'unknown_action');
  assert.equal(b.ss.getSheetByName('Ergebnisse').data.length, 1);
});

test('names that look like formulas are neutralised', () => {
  const b = fresh();
  b.post({ action: 'submit', token: b.token(), submission: submission('=HYPERLINK("x")') });
  assert.equal(b.ss.getSheetByName('Ergebnisse').data[1][3], '\'=HYPERLINK("x")');
});

test('list needs the password and returns results and grades', () => {
  const b = fresh();
  const s = submission('Adam');
  b.post({ action: 'submit', token: b.token(), submission: s });
  assert.equal(b.post({ action: 'list', password: 'falsch' }).error, 'bad_password');
  const res = b.post({ action: 'list', password: 'lehrer-passwort' });
  assert.equal(res.ok, true);
  assert.equal(res.results.length, 1);
  assert.equal(res.results[0].data.sid, s.sid);
  assert.deepEqual(res.grades, []);
});

test('grading an open answer is saved, updated and listed', () => {
  const b = fresh();
  const s = submission('Adam');
  b.post({ action: 'submit', token: b.token(), submission: s });
  const pw = 'lehrer-passwort';
  assert.equal(b.post({ action: 'grade', password: pw, sid: s.sid, n: 17, points: 1.5, comment: 'gut' }).ok, true);
  assert.equal(b.post({ action: 'grade', password: pw, sid: s.sid, n: 17, points: 2, comment: 'sehr gut' }).ok, true);
  const g = b.post({ action: 'list', password: pw }).grades;
  assert.equal(g.length, 1);
  assert.deepEqual([g[0].n, g[0].points, g[0].comment], [17, 2, 'sehr gut']);
  assert.equal(b.post({ action: 'grade', password: pw, sid: crypto.randomUUID(), n: 17, points: 1, comment: '' }).error, 'unknown_sid');
});

test('password can be set by hand as script property TEACHER_PASSWORD', () => {
  const b = createBackend();
  b.props.SUBMIT_TOKEN = 't';
  b.props.SHEET_ID = 'x';
  assert.equal(b.post({ action: 'list', password: 'egal' }).error, 'no_password_set');
  b.props.TEACHER_PASSWORD = 'koran2026 ';
  assert.equal(b.post({ action: 'list', password: ' koran2026' }).ok, true);
  assert.equal(b.post({ action: 'list', password: 'Koran2026' }).error, 'bad_password');
});

test('too many wrong passwords lock the teacher page', () => {
  const b = fresh();
  for (let i = 0; i < 10; i++) b.post({ action: 'list', password: 'x' });
  assert.equal(b.post({ action: 'list', password: 'lehrer-passwort' }).error, 'locked');
});
