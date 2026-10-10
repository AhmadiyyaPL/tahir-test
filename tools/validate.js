#!/usr/bin/env node
// Checks every test file in public/tests/ and, if all are valid, rewrites
// public/tests/index.json (the list the start page shows).
//
//   node tools/validate.js            check all tests, update the index
//   node tools/validate.js --check    check only, do not write anything
//
// Exit code 0 = everything fine, 1 = at least one error (index left untouched).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'public', 'tests');
const INDEX = 'index.json';
const LANGS = ['pl', 'en'];
const TYPES = ['mc', 'fill', 'order', 'table', 'open'];
const checkOnly = process.argv.includes('--check');

const color = process.stdout.isTTY && !process.env.NO_COLOR;
const red = (s) => (color ? `\x1b[31m${s}\x1b[0m` : s);
const green = (s) => (color ? `\x1b[32m${s}\x1b[0m` : s);
const yellow = (s) => (color ? `\x1b[33m${s}\x1b[0m` : s);

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const isInt = (x) => Number.isInteger(x);
const filled = (x) => typeof x === 'string' && x.trim() !== '';

export function validateTest(data, fileName) {
  const errors = [];
  const warnings = [];
  const err = (where, msg) => errors.push(`${where}: ${msg}`);
  const warn = (where, msg) => warnings.push(`${where}: ${msg}`);

  // Every text must exist in both languages.
  const text = (where, x, what) => {
    if (!isObj(x)) { err(where, `${what} fehlt oder ist kein {"pl": …, "en": …}-Objekt`); return; }
    for (const l of LANGS) if (!filled(x[l])) err(where, `${what}: Sprache "${l}" ist leer oder fehlt`);
  };

  if (!isObj(data)) { err('Datei', 'ist kein JSON-Objekt'); return { errors, warnings }; }

  // ---- meta
  const meta = data.meta;
  if (!isObj(meta)) err('meta', 'fehlt');
  else {
    if (!filled(meta.id) || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(meta.id)) {
      err('meta.id', 'nur Kleinbuchstaben, Ziffern und "-" (max. 40 Zeichen), z. B. "czesc-2"');
    } else if (fileName && fileName !== `${meta.id}.json`) {
      err('meta.id', `"${meta.id}" passt nicht zum Dateinamen "${fileName}" (erwartet: ${meta.id}.json)`);
    }
    text('meta.title', meta.title, 'Titel');
    if (meta.subtitle !== undefined) text('meta.subtitle', meta.subtitle, 'Untertitel');
    if (!isInt(meta.pointsMax) || meta.pointsMax < 1) err('meta.pointsMax', 'muss eine ganze Zahl ≥ 1 sein');
    if (meta.active !== undefined && typeof meta.active !== 'boolean') err('meta.active', 'muss true oder false sein');
    if (meta.order !== undefined && !isInt(meta.order)) err('meta.order', 'muss eine ganze Zahl sein');
  }

  // ---- sections
  const sectionIds = new Set();
  if (!Array.isArray(data.sections) || !data.sections.length) err('sections', 'fehlt oder ist leer');
  else data.sections.forEach((s, i) => {
    const where = `Kapitel #${i + 1}`;
    if (!isObj(s)) { err(where, 'ist kein Objekt'); return; }
    if (!isInt(s.id)) err(where, '"id" muss eine ganze Zahl sein');
    else if (sectionIds.has(s.id)) err(where, `id ${s.id} kommt doppelt vor`);
    else sectionIds.add(s.id);
    for (const l of LANGS) if (!filled(s[l])) err(where, `Name in Sprache "${l}" fehlt`);
  });

  // ---- items
  if (!Array.isArray(data.items) || !data.items.length) {
    err('items', 'fehlt oder ist leer');
    return { errors, warnings };
  }
  let sum = 0;
  const seen = new Set();
  const usedSections = new Set();
  data.items.forEach((it, i) => {
    const where = `Aufgabe ${isObj(it) && it.n !== undefined ? it.n : `#${i + 1}`}${isObj(it) && it.type ? ` (${it.type})` : ''}`;
    if (!isObj(it)) { err(where, 'ist kein Objekt'); return; }

    if (!isInt(it.n) || it.n < 1) err(where, '"n" muss eine ganze Zahl ≥ 1 sein');
    else {
      if (seen.has(it.n)) err(where, `Nummer ${it.n} kommt doppelt vor`);
      seen.add(it.n);
      if (it.n !== i + 1) err(where, `steht an Position ${i + 1}, hat aber n = ${it.n} (Aufgaben müssen 1, 2, 3 … durchnummeriert sein)`);
    }
    if (!sectionIds.has(it.section)) err(where, `"section": ${JSON.stringify(it.section)} gibt es nicht in "sections"`);
    else usedSections.add(it.section);
    if (!TYPES.includes(it.type)) { err(where, `unbekannter Typ ${JSON.stringify(it.type)} — erlaubt: ${TYPES.join(', ')}`); return; }
    text(where, it.prompt, 'Fragetext "prompt"');
    if (it.help !== undefined) text(where, it.help, 'Hinweis "help"');
    if (!isInt(it.points) || it.points < 0) { err(where, '"points" muss eine ganze Zahl ≥ 0 sein'); return; }
    sum += it.points;

    switch (it.type) {
      case 'mc': {
        if (it.points < 1) err(where, '"points" muss bei mc mindestens 1 sein');
        if (!Array.isArray(it.options) || it.options.length < 2) { err(where, '"options" braucht mindestens 2 Antworten'); break; }
        if (it.options.length > 8) err(where, 'höchstens 8 Antwortmöglichkeiten');
        it.options.forEach((o, k) => text(where, o, `Antwort ${k} (Index ${k})`));
        if (!isInt(it.correct) || it.correct < 0 || it.correct >= it.options.length) {
          err(where, `"correct": ${JSON.stringify(it.correct)} ist kein gültiger Index (0 bis ${it.options.length - 1})`);
        }
        const keys = it.options.filter(isObj).map((o) => `${o.pl}|${o.en}`);
        if (new Set(keys).size !== keys.length) err(where, 'zwei Antworten sind identisch');
        break;
      }
      case 'fill': {
        if (it.points < 1) err(where, '"points" muss bei fill mindestens 1 sein');
        if (!Array.isArray(it.accept) || !it.accept.length || !it.accept.every(filled)) err(where, '"accept" braucht mindestens eine nicht-leere Lösung (Text)');
        if (it.unit !== undefined) text(where, it.unit, 'Einheit "unit"');
        break;
      }
      case 'order': {
        if (it.points !== 2) err(where, `"points" muss bei order 2 sein (2 = alles richtig, 1 = ab 70 %), ist ${it.points}`);
        if (!Array.isArray(it.tiles) || it.tiles.length < 2) { err(where, '"tiles" braucht mindestens 2 Kacheln'); break; }
        it.tiles.forEach((tile, k) => text(where, tile, `Kachel ${k}`));
        const co = it.correctOrder;
        const n = it.tiles.length;
        if (!Array.isArray(co) || co.length !== n) {
          err(where, `"correctOrder" muss genau ${n} Einträge haben (einen pro Kachel)`);
        } else {
          const bad = co.filter((x) => !isInt(x) || x < 0 || x >= n);
          const dup = co.filter((x, k) => co.indexOf(x) !== k);
          if (bad.length) err(where, `"correctOrder" enthält ungültige Indizes ${JSON.stringify(bad)} (erlaubt 0 bis ${n - 1})`);
          else if (dup.length) {
            const missing = [...Array(n).keys()].filter((x) => !co.includes(x));
            err(where, `"correctOrder" ist keine Permutation: doppelt ${JSON.stringify([...new Set(dup)])}, fehlt ${JSON.stringify(missing)}`);
          }
          // In a permutation, any mistake misplaces at least two tiles, so the best
          // non-perfect answer has n - 2 hits.
          const need = Math.floor((n * 7 + 9) / 10);
          if (need > n - 2) warn(where, `bei ${n} Kacheln ist kein Teilpunkt möglich: 70 % = ${need} richtige Positionen, aber schon eine Vertauschung lässt nur ${n - 2} richtig`);
        }
        break;
      }
      case 'table': {
        if (!Array.isArray(it.columns) || !it.columns.length) { err(where, '"columns" fehlt'); break; }
        it.columns.forEach((c, k) => text(where, c, `Spalte ${k}`));
        if (!Array.isArray(it.rows) || !it.rows.length) { err(where, '"rows" fehlt'); break; }
        let blanks = 0;
        it.rows.forEach((row, r) => {
          const rw = `${where} › Zeile ${r + 1}`;
          if (!isObj(row)) { err(rw, 'ist kein Objekt'); return; }
          text(rw, row.name, 'Zeilenname "name"');
          if (!Array.isArray(row.cells) || row.cells.length !== it.columns.length) {
            err(rw, `"cells" muss genau ${it.columns.length} Einträge haben`); return;
          }
          const nullCols = row.cells.map((c, k) => (c === null ? k : -1)).filter((k) => k >= 0);
          row.cells.forEach((c, k) => { if (c !== null && typeof c !== 'string') err(rw, `Zelle ${k} muss Text oder null sein`); });
          if (!Array.isArray(row.blanks)) { err(rw, '"blanks" fehlt (leere Liste [] wenn nichts fehlt)'); return; }
          const blankCols = [];
          row.blanks.forEach((b, k) => {
            if (!isObj(b) || !isInt(b.col) || b.col < 0 || b.col >= it.columns.length) { err(rw, `Lücke ${k}: "col" ungültig`); return; }
            if (!filled(String(b.answer == null ? '' : b.answer))) err(rw, `Lücke in Spalte ${b.col}: "answer" fehlt`);
            blankCols.push(b.col);
          });
          const a = [...nullCols].sort().join(','), b = [...blankCols].sort().join(',');
          if (a !== b) err(rw, `null-Zellen (Spalten ${a || '–'}) und "blanks" (Spalten ${b || '–'}) passen nicht zusammen`);
          blanks += blankCols.length;
        });
        if (blanks === 0) err(where, 'Tabelle ohne Lücken');
        if (it.points !== blanks) err(where, `"points" muss der Zahl der Lücken entsprechen (${blanks}), ist ${it.points}`);
        break;
      }
      case 'open': {
        if (it.points !== 0) err(where, `"points" muss bei open 0 sein (wird von Hand bewertet), ist ${it.points}`);
        if (it.manualMax !== undefined && (!isInt(it.manualMax) || it.manualMax < 0 || it.manualMax > 20)) err(where, '"manualMax" muss eine ganze Zahl von 0 bis 20 sein');
        if (it.grading !== undefined && it.grading !== 'manual') err(where, '"grading" darf nur "manual" sein');
        break;
      }
    }
  });

  if (meta && isInt(meta.pointsMax) && sum !== meta.pointsMax) {
    err('meta.pointsMax', `ist ${meta.pointsMax}, die Aufgaben ergeben aber ${sum} Punkte`);
  }
  for (const id of sectionIds) if (!usedSections.has(id)) warn(`Kapitel ${id}`, 'hat keine Aufgaben');

  return { errors, warnings };
}

function summarize(data, file) {
  const manualMax = data.items.reduce((s, it) => s + (it.type === 'open' ? (it.manualMax || 0) : 0), 0);
  const entry = {
    id: data.meta.id,
    file,
    title: data.meta.title,
    items: data.items.length,
    sections: data.sections.length,
    pointsMax: data.meta.pointsMax,
    manualMax,
  };
  if (data.meta.subtitle) entry.subtitle = data.meta.subtitle;
  if (data.meta.active === false) entry.active = false;
  if (data.meta.order !== undefined) entry.order = data.meta.order;
  return entry;
}

function main() {
  if (!fs.existsSync(DIR)) { console.error(red(`Ordner fehlt: ${DIR}`)); process.exit(1); }
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.json') && f !== INDEX).sort();
  if (!files.length) { console.error(red('Keine Testdateien in public/tests/ gefunden.')); process.exit(1); }

  let failed = 0;
  const entries = [];
  const ids = new Map();
  for (const file of files) {
    let data;
    try {
      data = JSON.parse(fs.readFileSync(path.join(DIR, file), 'utf8').replace(/^﻿/, ''));
    } catch (e) {
      console.log(red(`✗ ${file}`));
      console.log(`    JSON-Syntaxfehler: ${e.message}`);
      console.log('    Tipp: oft fehlt ein Komma oder es ist eines zu viel vor } oder ].');
      failed++;
      continue;
    }
    const { errors, warnings } = validateTest(data, file);
    if (data && data.meta && ids.has(data.meta.id)) errors.push(`meta.id: "${data.meta.id}" wird schon von ${ids.get(data.meta.id)} benutzt`);
    if (errors.length) {
      console.log(red(`✗ ${file} — ${errors.length} Fehler`));
      errors.forEach((e) => console.log(`    ${e}`));
      failed++;
    } else {
      ids.set(data.meta.id, file);
      const e = summarize(data, file);
      entries.push(e);
      console.log(green(`✓ ${file}`) + ` — ${e.items} Aufgaben, ${e.pointsMax} Punkte` + (e.manualMax ? ` + ${e.manualMax} von Hand` : '') + (e.active === false ? ' (inaktiv)' : ''));
    }
    warnings.forEach((w) => console.log(yellow(`    Hinweis — ${w}`)));
  }

  if (failed) {
    console.log(red(`\n${failed} Datei(en) fehlerhaft. index.json wurde NICHT geändert.`));
    process.exit(1);
  }
  entries.sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9) || a.id.localeCompare(b.id));
  const out = JSON.stringify({ generated: 'tools/validate.js — nicht von Hand bearbeiten', tests: entries }, null, 2) + '\n';
  const indexPath = path.join(DIR, INDEX);
  if (checkOnly) {
    const current = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, 'utf8') : '';
    if (current !== out) {
      console.log(red('\nindex.json ist veraltet. Bitte "node tools/validate.js" ohne --check ausführen.'));
      process.exit(1);
    }
    console.log(green('\nAlles in Ordnung.'));
  } else {
    fs.writeFileSync(indexPath, out);
    console.log(green(`\nAlles in Ordnung. public/tests/${INDEX} aktualisiert (${entries.length} Test(s)).`));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
