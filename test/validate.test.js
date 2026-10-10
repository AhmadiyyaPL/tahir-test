import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateTest } from '../tools/validate.js';

const load = () => JSON.parse(fs.readFileSync(new URL('../public/tests/czesc-1.json', import.meta.url), 'utf8'));
const errorsOf = (data) => validateTest(data, 'czesc-1.json').errors;

test('the shipped catalogue is valid', () => {
  assert.deepEqual(errorsOf(load()), []);
});

test('reports a broken mc index with the task number', () => {
  const d = load();
  d.items[0].correct = 7;
  const e = errorsOf(d);
  assert.equal(e.length, 1);
  assert.match(e[0], /^Aufgabe 1 \(mc\): "correct": 7/);
});

test('reports a missing language', () => {
  const d = load();
  d.items[4].prompt.en = '';
  assert.match(errorsOf(d)[0], /^Aufgabe 5 \(fill\).*"en"/);
});

test('order must be a real permutation', () => {
  const d = load();
  d.items[12].correctOrder = [1, 5, 3, 6, 0, 7, 4, 4];
  assert.match(errorsOf(d).join('\n'), /Aufgabe 13 \(order\).*keine Permutation.*doppelt \[4\].*fehlt \[2\]/);
});

test('points must fit the type and add up to pointsMax', () => {
  const d = load();
  d.items[11].points = 4; // table with 5 blanks
  const e = errorsOf(d).join('\n');
  assert.match(e, /Aufgabe 12 \(table\).*Zahl der Lücken entsprechen \(5\), ist 4/);
  assert.match(e, /meta\.pointsMax.*39/);
});

test('table blanks must match the empty cells', () => {
  const d = load();
  d.items[11].rows[0].blanks[0].col = 2;
  assert.match(errorsOf(d).join('\n'), /Aufgabe 12 \(table\) › Zeile 1/);
});

test('unknown types and sections are caught', () => {
  const d = load();
  d.items[2].type = 'quiz';
  d.items[3].section = 9;
  const e = errorsOf(d).join('\n');
  assert.match(e, /Aufgabe 3 \(quiz\): unbekannter Typ/);
  assert.match(e, /Aufgabe 4 \(mc\): "section": 9/);
});

test('file name must match meta.id', () => {
  const d = load();
  assert.match(validateTest(d, 'czesc-2.json').errors[0], /Dateinamen/);
});
