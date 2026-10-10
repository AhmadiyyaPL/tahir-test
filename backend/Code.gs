/**
 * Tahir Academy · Test — Backend (Google Apps Script, an ein Google Sheet gebunden)
 *
 * Diese Datei komplett in den Apps-Script-Editor des Sheets einfügen
 * (Erweiterungen → Apps Script). Schritt-für-Schritt-Anleitung: DEPLOY.md
 *
 * Endpunkte (alle per POST, Body = JSON als text/plain, siehe unten):
 *   { action: "submit", token, submission }   Schülerseite: Ergebnis abgeben
 *   { action: "list",   password }            Lehrerseite: alle Ergebnisse + Bewertungen
 *   { action: "grade",  password, sid, n, points, comment }   Lehrerseite: offene Frage bewerten
 *   { action: "ping" }                         Funktionstest
 *
 * Warum text/plain? Apps Script beantwortet keinen CORS-Preflight (OPTIONS).
 * Ein POST mit Content-Type "text/plain" ist ein "simple request" ohne Preflight.
 * Wir lesen den Text hier mit JSON.parse. Die Antwort (ContentService) liefert
 * Google mit "Access-Control-Allow-Origin: *" aus, daher kann die Seite sie lesen.
 *
 * Gespeichert wird nur: Vorname, Alter, Sprache, Antworten, Punkte, Zeitstempel.
 */

var VERSION = '1.0';
var SHEET_RESULTS = 'Ergebnisse';
var SHEET_GRADES = 'Bewertungen';
var RESULT_HEADERS = ['Empfangen', 'ID', 'Test', 'Name', 'Alter', 'Sprache', 'Begonnen', 'Beendet',
  'Punkte', 'Max', 'Prozent', 'Kapitel', 'Offene Antworten', 'Daten (JSON)'];
var GRADE_HEADERS = ['ID', 'Aufgabe', 'Punkte', 'Kommentar', 'Bewertet am'];
var COL_SID = 2;
var COL_JSON = 14;
var MAX_BODY = 60000;          // Zeichen pro Anfrage
var MAX_JSON_CELL = 45000;     // Google Sheets erlaubt 50 000 Zeichen pro Zelle
var RATE_PER_MINUTE = 120;     // Abgaben pro Minute insgesamt
var PW_FAIL_LIMIT = 10;        // falsche Passwörter, danach 15 Minuten Sperre

// ------------------------------------------------------------------ Menü im Sheet

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Tahir-Test')
    .addItem('1. Einrichten (einmalig)', 'menuSetup')
    .addItem('2. Zugangsdaten für config.json anzeigen', 'menuShowConfig')
    .addSeparator()
    .addItem('Lehrer-Passwort ändern', 'menuSetPassword')
    .addItem('Neuen Token erzeugen (alter wird ungültig)', 'menuNewToken')
    .addToUi();
}

function menuSetup() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var props = PropertiesService.getScriptProperties();
  props.setProperty('SHEET_ID', ss.getId());
  ensureSheets_(ss);
  if (!props.getProperty('SUBMIT_TOKEN')) props.setProperty('SUBMIT_TOKEN', randomToken_());
  if (!props.getProperty('PW_HASH')) {
    if (!askPassword_()) {
      ui.alert('Einrichtung abgebrochen', 'Ohne Lehrer-Passwort ist die Einrichtung nicht fertig. Bitte noch einmal „1. Einrichten“ wählen.', ui.ButtonSet.OK);
      return;
    }
  }
  ui.alert('Einrichtung fertig',
    'Die Tabellenblätter „' + SHEET_RESULTS + '“ und „' + SHEET_GRADES + '“ sind angelegt, ' +
    'Token und Passwort sind gespeichert.\n\nNächster Schritt laut DEPLOY.md: die Web-App bereitstellen ' +
    '(„Bereitstellen → Neue Bereitstellung“) und danach „2. Zugangsdaten für config.json anzeigen“.',
    ui.ButtonSet.OK);
}

function menuShowConfig() {
  var ui = SpreadsheetApp.getUi();
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('SUBMIT_TOKEN');
  if (!token) { ui.alert('Bitte zuerst „1. Einrichten“ ausführen.'); return; }
  var url = '';
  try { url = ScriptApp.getService().getUrl() || ''; } catch (e) { /* noch nicht bereitgestellt */ }
  if (url && !/\/exec$/.test(url)) url = '';
  var json = '{\n  "endpoint": "' + (url || 'HIER-DIE-WEB-APP-URL-EINFÜGEN') + '",\n  "token": "' + token + '"\n}';
  ui.alert('Inhalt für public/config.json',
    (url ? '' : 'Die Web-App-URL konnte nicht ermittelt werden — kopiere sie aus „Bereitstellen → Bereitstellungen verwalten“ (endet auf /exec).\n\n') +
    'Kopiere diesen Text vollständig in die Datei public/config.json:\n\n' + json, ui.ButtonSet.OK);
}

function menuSetPassword() {
  if (askPassword_()) SpreadsheetApp.getUi().alert('Neues Lehrer-Passwort gespeichert.');
}

function menuNewToken() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.alert('Neuen Token erzeugen?',
    'Danach nimmt der Server Ergebnisse nur noch an, wenn du den neuen Token in public/config.json einträgst und die Seite neu hochlädst. ' +
    'Schon ausgefüllte, noch nicht gesendete Ergebnisse auf den Handys werden automatisch mit dem neuen Token gesendet, sobald die neue config.json online ist.',
    ui.ButtonSet.OK_CANCEL);
  if (r !== ui.Button.OK) return;
  PropertiesService.getScriptProperties().setProperty('SUBMIT_TOKEN', randomToken_());
  menuShowConfig();
}

function askPassword_() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt('Lehrer-Passwort festlegen', 'Mit diesem Passwort öffnest du die Lehrerseite. Mindestens 8 Zeichen.', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return false;
  var pw = r.getResponseText();
  if (!pw || pw.length < 8) { ui.alert('Das Passwort muss mindestens 8 Zeichen haben.'); return askPassword_(); }
  var salt = randomToken_();
  var props = PropertiesService.getScriptProperties();
  props.setProperty('PW_SALT', salt);
  props.setProperty('PW_HASH', hash_(salt + pw));
  return true;
}

// ------------------------------------------------------------------ HTTP

function doGet() {
  return out_({ ok: true, service: 'tahir-test', version: VERSION });
}

function doPost(e) {
  try {
    var raw = (e && e.postData && e.postData.contents) || '';
    if (raw.length > MAX_BODY) return out_({ ok: false, error: 'too_large' });
    var req;
    try { req = JSON.parse(raw); } catch (err) { return out_({ ok: false, error: 'bad_json' }); }
    if (!req || typeof req !== 'object') return out_({ ok: false, error: 'bad_json' });
    switch (req.action) {
      case 'submit': return out_(submit_(req));
      case 'list': return out_(withPassword_(req, list_));
      case 'grade': return out_(withPassword_(req, grade_));
      case 'ping': return out_({ ok: true, version: VERSION });
      default: return out_({ ok: false, error: 'unknown_action' });
    }
  } catch (err) {
    console.error(err && err.stack || err);
    return out_({ ok: false, error: 'server_error' });
  }
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ------------------------------------------------------------------ submit

function submit_(req) {
  var token = PropertiesService.getScriptProperties().getProperty('SUBMIT_TOKEN');
  if (!token || req.token !== token) return { ok: false, error: 'bad_token' };
  var s = req.submission;
  var problem = checkSubmission_(s);
  if (problem) return { ok: false, error: 'invalid', detail: problem };
  var json = JSON.stringify(s);
  if (json.length > MAX_JSON_CELL) return { ok: false, error: 'invalid', detail: 'too long' };

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sheet = sheet_(SHEET_RESULTS);
    // Same submission id again (retry after a lost answer) → already stored, report success.
    if (findRow_(sheet, COL_SID, s.sid)) return { ok: true, duplicate: true };
    if (!rateOk_()) return { ok: false, error: 'rate_limited' };

    var open = s.items
      .filter(function (i) { return i.m === 0 && typeof i.a === 'string'; })
      .map(function (i) { return i.n + ': ' + i.a; })
      .join('\n');
    sheet.appendRow([
      new Date(), s.sid, s.testId, safe_(s.name.trim()), s.age, s.lang,
      toDate_(s.startedAt), toDate_(s.finishedAt),
      s.got, s.max, s.max ? s.got / s.max : 0,
      s.sections.map(function (x) { return x.got + '/' + x.max; }).join(' · '),
      safe_(open), json,
    ]);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function checkSubmission_(s) {
  if (!s || typeof s !== 'object') return 'submission missing';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(String(s.sid))) return 'sid';
  if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(String(s.testId))) return 'testId';
  if (typeof s.name !== 'string' || !s.name.trim() || s.name.length > 40) return 'name';
  if (!isInt_(s.age) || s.age < 3 || s.age > 25) return 'age';
  if (s.lang !== 'pl' && s.lang !== 'en') return 'lang';
  if (isNaN(Date.parse(s.startedAt)) || isNaN(Date.parse(s.finishedAt))) return 'dates';
  if (!isInt_(s.got) || !isInt_(s.max) || s.got < 0 || s.got > s.max || s.max > 1000) return 'points';
  if (!isInt_(s.manualMax) || s.manualMax < 0 || s.manualMax > 1000) return 'manualMax';
  if (!Array.isArray(s.sections) || s.sections.length > 30) return 'sections';
  for (var i = 0; i < s.sections.length; i++) {
    var x = s.sections[i];
    if (!x || !isInt_(x.id) || !isInt_(x.got) || !isInt_(x.max)) return 'sections';
  }
  if (!Array.isArray(s.items) || !s.items.length || s.items.length > 300) return 'items';
  for (var j = 0; j < s.items.length; j++) {
    var it = s.items[j];
    if (!it || !isInt_(it.n) || typeof it.g !== 'number' || typeof it.m !== 'number') return 'items';
    if (typeof it.a === 'string' && it.a.length > 1000) return 'answer too long';
  }
  return null;
}

// ------------------------------------------------------------------ teacher

function withPassword_(req, fn) {
  var cache = CacheService.getScriptCache();
  var fails = Number(cache.get('pwfail') || 0);
  if (fails >= PW_FAIL_LIMIT) return { ok: false, error: 'locked' };
  if (!checkPassword_(req.password)) {
    cache.put('pwfail', String(fails + 1), 900);
    Utilities.sleep(700);
    return { ok: false, error: 'bad_password' };
  }
  return fn(req);
}

function checkPassword_(pw) {
  var props = PropertiesService.getScriptProperties();
  var salt = props.getProperty('PW_SALT');
  var stored = props.getProperty('PW_HASH');
  if (!salt || !stored || typeof pw !== 'string' || !pw) return false;
  return hash_(salt + pw) === stored;
}

function list_() {
  var sheet = sheet_(SHEET_RESULTS);
  var results = [];
  var last = sheet.getLastRow();
  if (last >= 2) {
    var rows = sheet.getRange(2, 1, last - 1, COL_JSON).getValues();
    rows.forEach(function (r) {
      var data = null;
      try { data = JSON.parse(r[COL_JSON - 1]); } catch (e) { return; }
      if (!data || !data.sid) return;
      results.push({ receivedAt: r[0] instanceof Date ? r[0].toISOString() : String(r[0]), data: data });
    });
  }
  var g = sheet_(SHEET_GRADES);
  var grades = [];
  var gl = g.getLastRow();
  if (gl >= 2) {
    g.getRange(2, 1, gl - 1, GRADE_HEADERS.length).getValues().forEach(function (r) {
      if (!r[0]) return;
      grades.push({
        sid: String(r[0]), n: Number(r[1]), points: r[2] === '' ? null : Number(r[2]),
        comment: String(r[3] || ''), gradedAt: r[4] instanceof Date ? r[4].toISOString() : String(r[4] || ''),
      });
    });
  }
  return { ok: true, results: results, grades: grades };
}

function grade_(req) {
  var sid = String(req.sid || '');
  var n = req.n;
  var points = req.points;
  var comment = typeof req.comment === 'string' ? req.comment.slice(0, 500) : '';
  if (!/^[0-9a-f-]{36}$/.test(sid) || !isInt_(n)) return { ok: false, error: 'invalid' };
  if (points !== null && (typeof points !== 'number' || points < 0 || points > 100)) return { ok: false, error: 'invalid' };
  if (points !== null) points = Math.round(points * 2) / 2;

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (!findRow_(sheet_(SHEET_RESULTS), COL_SID, sid)) return { ok: false, error: 'unknown_sid' };
    var g = sheet_(SHEET_GRADES);
    var last = g.getLastRow();
    var row = 0;
    if (last >= 2) {
      var keys = g.getRange(2, 1, last - 1, 2).getValues();
      for (var i = 0; i < keys.length; i++) {
        if (String(keys[i][0]) === sid && Number(keys[i][1]) === n) { row = i + 2; break; }
      }
    }
    var now = new Date();
    if (points === null && !comment) {
      if (row) g.deleteRow(row);
    } else if (row) {
      g.getRange(row, 3, 1, 3).setValues([[points === null ? '' : points, safe_(comment), now]]);
    } else {
      g.appendRow([sid, n, points === null ? '' : points, safe_(comment), now]);
    }
    return { ok: true, gradedAt: now.toISOString() };
  } finally {
    lock.releaseLock();
  }
}

// ------------------------------------------------------------------ helpers

function sheet_(name) {
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  var ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) { ensureSheets_(ss); sh = ss.getSheetByName(name); }
  return sh;
}

function ensureSheets_(ss) {
  [[SHEET_RESULTS, RESULT_HEADERS], [SHEET_GRADES, GRADE_HEADERS]].forEach(function (def) {
    var sh = ss.getSheetByName(def[0]) || ss.insertSheet(def[0]);
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, def[1].length).setValues([def[1]]).setFontWeight('bold');
      sh.setFrozenRows(1);
    }
  });
  var r = ss.getSheetByName(SHEET_RESULTS);
  r.getRange('A:A').setNumberFormat('yyyy-mm-dd hh:mm');
  r.getRange('G:H').setNumberFormat('yyyy-mm-dd hh:mm');
  r.getRange('K:K').setNumberFormat('0%');
  r.getRange('B:B').setNumberFormat('@');
  ss.getSheetByName(SHEET_GRADES).getRange('E:E').setNumberFormat('yyyy-mm-dd hh:mm');
}

function findRow_(sheet, col, value) {
  var last = sheet.getLastRow();
  if (last < 2) return 0;
  var hit = sheet.getRange(2, col, last - 1, 1).createTextFinder(String(value)).matchEntireCell(true).findNext();
  return hit ? hit.getRow() : 0;
}

function rateOk_() {
  var cache = CacheService.getScriptCache();
  var key = 'rate:' + Math.floor(Date.now() / 60000);
  var n = Number(cache.get(key) || 0);
  if (n >= RATE_PER_MINUTE) return false;
  cache.put(key, String(n + 1), 120);
  return true;
}

// Text that starts with = + - @ would be treated as a formula by Sheets.
function safe_(v) {
  var s = String(v == null ? '' : v);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function toDate_(iso) { var d = new Date(iso); return isNaN(d) ? '' : d; }
function isInt_(x) { return typeof x === 'number' && isFinite(x) && Math.floor(x) === x; }

function hash_(s) {
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8));
}

function randomToken_() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
}
