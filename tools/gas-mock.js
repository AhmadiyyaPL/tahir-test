// Runs backend/Code.gs inside Node with small in-memory fakes of the Google services
// it uses (SpreadsheetApp, PropertiesService, CacheService, LockService, …).
// Used by the backend tests and by `node tools/serve.js --mock` for local end-to-end runs.
// Only the calls Code.gs actually makes are implemented.

import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CODE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'backend', 'Code.gs');

function colIndex(letter) { return letter.toUpperCase().charCodeAt(0) - 64; }

class FakeRange {
  constructor(sheet, row, col, rows, cols) { Object.assign(this, { sheet, row, col, rows, cols }); }
  getValues() {
    const out = [];
    for (let r = 0; r < this.rows; r++) {
      const src = this.sheet.data[this.row - 1 + r] || [];
      const line = [];
      for (let c = 0; c < this.cols; c++) { const v = src[this.col - 1 + c]; line.push(v === undefined ? '' : v); }
      out.push(line);
    }
    return out;
  }
  setValues(values) {
    values.forEach((line, r) => {
      const idx = this.row - 1 + r;
      while (this.sheet.data.length <= idx) this.sheet.data.push([]);
      line.forEach((v, c) => { this.sheet.data[idx][this.col - 1 + c] = v; });
    });
    return this;
  }
  setFontWeight() { return this; }
  setNumberFormat() { return this; }
  createTextFinder(text) {
    const range = this;
    let entire = false;
    return {
      matchEntireCell(v) { entire = v; return this; },
      findNext() {
        const vals = range.getValues();
        for (let r = 0; r < vals.length; r++) {
          for (let c = 0; c < vals[r].length; c++) {
            const s = String(vals[r][c]);
            if (entire ? s === text : s.includes(text)) return { getRow: () => range.row + r };
          }
        }
        return null;
      },
    };
  }
}

class FakeSheet {
  constructor(name) { this.name = name; this.data = []; }
  getLastRow() { return this.data.length; }
  appendRow(row) { this.data.push(row.slice()); return this; }
  deleteRow(n) { this.data.splice(n - 1, 1); }
  setFrozenRows() {}
  getRange(a, b, c, d) {
    if (typeof a === 'string') {
      const [from, to] = a.split(':');
      const c1 = colIndex(from), c2 = colIndex(to || from);
      return new FakeRange(this, 1, c1, Math.max(1, this.data.length), c2 - c1 + 1);
    }
    return new FakeRange(this, a, b, c || 1, d || 1);
  }
}

class FakeSpreadsheet {
  constructor() { this.sheets = {}; }
  getId() { return 'fake-sheet-id'; }
  getSheetByName(n) { return this.sheets[n] || null; }
  insertSheet(n) { this.sheets[n] = new FakeSheet(n); return this.sheets[n]; }
}

export function createBackend() {
  const ss = new FakeSpreadsheet();
  const props = {};
  const cache = {};
  const store = (obj) => ({
    getProperty: (k) => (k in obj ? obj[k] : null),
    setProperty: (k, v) => { obj[k] = String(v); },
  });
  const context = {
    console,
    Date, JSON, Math, Number, String, Array, Object, isNaN, isFinite,
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, openById: () => ss, getUi: () => { throw new Error('no UI in mock'); } },
    PropertiesService: { getScriptProperties: () => store(props) },
    CacheService: { getScriptCache: () => ({ get: (k) => (k in cache ? cache[k] : null), put: (k, v) => { cache[k] = String(v); } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (s) => ({ content: s, setMimeType() { return this; } }),
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' },
      Charset: { UTF_8: 'utf8' },
      computeDigest: (alg, s) => [...crypto.createHash('sha256').update(s, 'utf8').digest()],
      base64Encode: (bytes) => Buffer.from(bytes.map((b) => (b + 256) % 256)).toString('base64'),
      getUuid: () => crypto.randomUUID(),
      sleep: () => {},
    },
    ScriptApp: { getService: () => ({ getUrl: () => '' }) },
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(CODE, 'utf8'), context, { filename: 'Code.gs' });

  // Same effect as the "1. Einrichten" menu, without the dialogs.
  function setup(password) {
    props.SHEET_ID = ss.getId();
    context.ensureSheets_(ss);
    props.SUBMIT_TOKEN = 'test-token';
    props.PW_SALT = 'salt';
    props.PW_HASH = context.hash_('salt' + password);
  }

  function post(payload) {
    const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const out = context.doPost({ postData: { contents: body } });
    return JSON.parse(out.content);
  }

  return { setup, post, ss, props, cache, context, token: () => props.SUBMIT_TOKEN };
}
