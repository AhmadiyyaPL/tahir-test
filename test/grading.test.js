import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as G from '../public/js/grading.js';

const PART1 = JSON.parse(fs.readFileSync(new URL('../public/tests/czesc-1.json', import.meta.url), 'utf8'));
const item = (n) => PART1.items.find((x) => x.n === n);

function perfectAnswers(t) {
  const a = {};
  for (const it of t.items) {
    if (it.type === 'mc') a[it.n] = it.correct;
    if (it.type === 'fill') a[it.n] = it.accept[0];
    if (it.type === 'order') a[it.n] = it.correctOrder.slice();
    if (it.type === 'table') a[it.n] = G.tableBlanks(it).map((b) => b.answer);
    if (it.type === 'open') a[it.n] = 'Eine Antwort.';
  }
  return a;
}

test('perfect run gives full automatic points', () => {
  const r = G.gradeTest(PART1, perfectAnswers(PART1));
  assert.equal(r.got, 40);
  assert.equal(r.max, 40);
  assert.equal(r.max, PART1.meta.pointsMax);
  assert.equal(r.pct, 100);
  assert.equal(r.manualMax, 4);
  assert.deepEqual(r.wrong, []);
  assert.equal(r.sections.reduce((s, x) => s + x.got, 0), 40);
  r.sections.forEach((s) => assert.equal(s.got, s.max));
});

test('empty run gives zero', () => {
  const r = G.gradeTest(PART1, {});
  assert.equal(r.got, 0);
  assert.equal(r.max, 40);
  assert.equal(r.pct, 0);
  assert.equal(r.wrong.length, PART1.items.filter((x) => x.type !== 'open').length);
});

test('blank answers (as created at test start) give zero', () => {
  const a = {};
  PART1.items.forEach((it) => { a[it.n] = G.blankAnswer(it); });
  assert.equal(G.gradeTest(PART1, a).got, 0);
});

test('section breakdown matches the catalogue', () => {
  const r = G.gradeTest(PART1, perfectAnswers(PART1));
  assert.deepEqual(r.sections.map((s) => s.max), [8, 13, 8, 11]);
});

test('open questions never score automatically', () => {
  const g = G.gradeItem(item(17), 'Weil wir rein sein sollen.');
  assert.deepEqual([g.got, g.max, g.manual, g.manualMax], [0, 0, true, 2]);
  assert.equal(G.statusOf(g), 'manual');
});

test('mc: right, wrong, unanswered', () => {
  assert.equal(G.gradeItem(item(1), 1).got, 1);
  assert.equal(G.gradeItem(item(1), 0).got, 0);
  assert.equal(G.gradeItem(item(1), null).got, 0);
});

test('fill: tolerant to spaces, case and words listed in accept', () => {
  assert.equal(G.gradeItem(item(32), ' 7 ').got, 1);
  assert.equal(G.gradeItem(item(32), 'Siedem').got, 1);
  assert.equal(G.gradeItem(item(32), 'SEVEN.').got, 1);
  assert.equal(G.gradeItem(item(32), '8').got, 0);
  assert.equal(G.gradeItem(item(6), '114').got, 1);
  assert.equal(G.gradeItem(item(6), '').got, 0);
});

test('table: one point per correct field', () => {
  const t = item(12);
  const right = G.tableBlanks(t).map((b) => b.answer); // ['2','4','4','2','3']
  assert.equal(G.gradeItem(t, right).got, 5);
  assert.equal(G.gradeItem(t, ['2', '4', '4', '9', '9']).got, 3);
  assert.equal(G.gradeItem(t, ['2', '', '', '', '']).got, 1);
  assert.equal(G.gradeItem(t, ['', '', '', '', '']).got, 0);
  assert.equal(G.gradeItem(t, ['0', '0', '0', '0', '0']).got, 0);
  assert.equal(G.gradeItem(t, right).max, 5);
});

test('order: 2 points when fully right', () => {
  const t = item(13);
  assert.equal(G.gradeItem(t, t.correctOrder.slice()).got, 2);
});

test('order: 1 point from 70 % correct positions (8 tiles: 6 needed)', () => {
  const t = item(13);
  const swapped = t.correctOrder.slice();
  [swapped[6], swapped[7]] = [swapped[7], swapped[6]]; // 6 of 8 in place = 75 %
  const g = G.gradeItem(t, swapped);
  assert.equal(g.hits, 6);
  assert.equal(g.got, 1);

  const twoSwaps = t.correctOrder.slice();
  [twoSwaps[0], twoSwaps[1]] = [twoSwaps[1], twoSwaps[0]];
  [twoSwaps[6], twoSwaps[7]] = [twoSwaps[7], twoSwaps[6]]; // 4 of 8 = 50 %
  assert.equal(G.gradeItem(t, twoSwaps).hits, 4);
  assert.equal(G.gradeItem(t, twoSwaps).got, 0);

  const rotate3 = t.correctOrder.slice();
  [rotate3[5], rotate3[6], rotate3[7]] = [rotate3[6], rotate3[7], rotate3[5]]; // 5 of 8 = 62.5 %
  assert.equal(G.gradeItem(t, rotate3).got, 0);
});

test('order: reversed or empty gives 0', () => {
  const t = item(34);
  assert.equal(G.gradeItem(t, t.correctOrder.slice().reverse()).got, 0);
  assert.equal(G.gradeItem(t, []).got, 0);
});

test('order: 70 % threshold is exact (no floating point surprises)', () => {
  assert.equal(G.orderPartialThreshold(4), 3);
  assert.equal(G.orderPartialThreshold(5), 4);
  assert.equal(G.orderPartialThreshold(8), 6);
  assert.equal(G.orderPartialThreshold(10), 7); // Math.ceil(10 * 0.7) would wrongly give 8
  assert.equal(G.orderPartialThreshold(20), 14);
});

test('order with 10 tiles: 7 in place earns the partial point', () => {
  const t = {
    n: 1, section: 0, type: 'order', points: 2,
    tiles: Array.from({ length: 10 }, (_, i) => ({ pl: String(i), en: String(i) })),
    correctOrder: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  };
  assert.equal(G.gradeItem(t, [0, 1, 2, 3, 4, 5, 6, 8, 9, 7]).got, 1);
});

test('malformed stored answers are treated as blank, not as a crash', () => {
  assert.equal(G.sanitizeAnswer(item(1), 99), null);
  assert.equal(G.sanitizeAnswer(item(1), '1'), null);
  assert.deepEqual(G.sanitizeAnswer(item(13), [1, 1, 2]), []);
  assert.deepEqual(G.sanitizeAnswer(item(12), ['1']), ['', '', '', '', '']);
  assert.equal(G.gradeTest(PART1, { 1: 'x', 12: 'oops', 13: { a: 1 } }).got, 0);
});

test('scoring does not depend on the interface language', () => {
  const a = perfectAnswers(PART1);
  assert.equal(G.describeCorrect(item(13), 'pl').split(' → ').length, 8);
  assert.equal(G.describeAnswer(item(1), a[1], 'en'), 'Often read or recited');
  assert.equal(G.describeAnswer(item(1), a[1], 'pl'), 'Często czytany lub recytowany');
});

test('isAnswered gates the Next button', () => {
  assert.equal(G.isAnswered(item(1), null), false);
  assert.equal(G.isAnswered(item(1), 0), true);
  assert.equal(G.isAnswered(item(13), [1, 5]), false);
  assert.equal(G.isAnswered(item(13), item(13).correctOrder), true);
  assert.equal(G.isAnswered(item(12), ['2', '4', '', '2', '3']), false);
  assert.equal(G.isAnswered(item(17), 'ab'), false);
  assert.equal(G.isAnswered(item(17), 'abc'), true);
});
