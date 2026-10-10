# Tahir Academy · Online-Test

Testsystem für den Samstagsunterricht. Die Kinder öffnen einen Link aus WhatsApp, machen den Test
auf Polnisch oder Englisch und drücken **„Wyślij wynik“**. Das Ergebnis landet automatisch in
deinem Google Sheet, ohne Login, ohne Screenshot und ohne Abtippen.

- **Schülerseite:** `index.html`, eine Aufgabe pro Bildschirm, funktioniert auch offline
- **Lehrerseite:** `lehrer.html` mit Passwort, Ergebnistabelle, Bewertung offener Fragen,
  Auswertung pro Aufgabe, CSV-Export
- **Backend:** Google Apps Script, das in ein Google Sheet in deinem Konto schreibt
- **Hosting:** GitHub Pages, kostenlos, HTTPS automatisch

Einrichtung für Nicht-Entwickler: **[DEPLOY.md](DEPLOY.md)**. Aufbau der Testdateien: **[SCHEMA.md](SCHEMA.md)**.

---

## Ordner

```
public/                 ← genau das wird veröffentlicht
  index.html            Schülerseite
  lehrer.html           Lehrerseite
  app.css               Gestaltung (hell/dunkel, Kapitelfarben)
  config.json           Backend-Adresse + Token (siehe DEPLOY.md, Teil C)
  sw.js                 Service Worker (Offline-Betrieb)
  tests/
    czesc-1.json        Test Teil I (35 Aufgaben, 40 Punkte + 4 von Hand)
    index.json          Testliste — wird von tools/validate.js erzeugt
  js/
    grading.js          Bewertung (gemeinsam für Schüler, Lehrer, Tests)
    student.js          Schülerseite
    teacher.js          Lehrerseite
    outbox.js           Sende-Warteschlange mit automatischen Wiederholungen
    api.js              Verbindung zum Apps Script (CORS-Lösung, siehe unten)
    store.js, dom.js    Speicher- und DOM-Helfer
    i18n.js             Texte der Oberfläche PL/EN
backend/Code.gs         Apps-Script-Code zum Einfügen
tools/validate.js       Prüft Testdateien, schreibt tests/index.json
tools/serve.js          lokaler Server (mit --mock: inkl. Backend-Simulation)
tools/gas-mock.js       simuliert die Google-Dienste für Tests
test/                   automatische Tests (Bewertung, Validator, Backend)
referenz/               Ausgangsmaterial (Original-Katalog, alte Einzeldatei-Version)
.github/workflows/      prüft + veröffentlicht bei jedem Push
```

Keine Abhängigkeiten, kein Build-Schritt. Nur Node.js (≥ 18) wird für Validator und Tests gebraucht.

## Lokal ausprobieren

```bash
node tools/serve.js --mock
```

Dann <http://localhost:8080/> (Schülerseite) und <http://localhost:8080/lehrer.html> (Passwort
`lehrer123`). Im Mock-Modus läuft der echte `backend/Code.gs` gegen eine Attrappe des Google Sheets.
Die Daten liegen nur im Arbeitsspeicher. <http://localhost:8080/__mock/down> und `/__mock/up`
simulieren ein ausgefallenes Backend.

Tests und Prüfung:

```bash
node --test
```

```bash
node tools/validate.js
```

## Einen neuen Test hinzufügen

1. `public/tests/czesc-1.json` kopieren, z. B. als `public/tests/czesc-2.json`.
2. In der Kopie `meta.id` auf `czesc-2` setzen, Titel ändern, Aufgaben ersetzen
   (Aufbau: [SCHEMA.md](SCHEMA.md)).
3. Prüfen:
   ```bash
   node tools/validate.js
   ```
   Bei Fehlern nennt das Skript Datei und Aufgabennummer, z. B.
   `Aufgabe 13 (order): "correctOrder" ist keine Permutation: doppelt [4], fehlt [2]`.
   Ist alles in Ordnung, wird `public/tests/index.json` aktualisiert.
4. Veröffentlichen:
   ```bash
   git add -A
   ```
   ```bash
   git commit -m "Test Teil II"
   ```
   ```bash
   git push
   ```
   GitHub prüft die Dateien noch einmal und veröffentlicht nur, wenn alles stimmt.

Sobald mehr als ein Test aktiv ist, zeigt die Startseite eine Auswahl. Mit `"active": false` in
`meta` blendest du einen Test aus, ohne ihn zu löschen. Code musst du dafür nicht anfassen.

---

## Wie es funktioniert

### Absenden ohne CORS-Probleme

Apps Script beantwortet keinen CORS-Preflight (`OPTIONS`). Die Seite sendet deshalb
`POST` mit `Content-Type: text/plain`. Das ist ein *simple request*, für den der Browser keinen
Preflight schickt. Das Script liest den Text mit `JSON.parse(e.postData.contents)`.
Google leitet die Antwort per 302 auf `script.googleusercontent.com` um und liefert sie dort mit
`Access-Control-Allow-Origin: *` aus. `fetch` folgt der Umleitung und kann die JSON-Antwort lesen.

Darum verwenden wir bewusst **nicht** `mode: 'no-cors'`. Damit wäre die Antwort unsichtbar, und
die Seite könnte nie sicher wissen, ob das Ergebnis angekommen ist. Mit lesbarer Antwort wird ein
Ergebnis erst dann als gesendet markiert, wenn das Script „ok“ geantwortet hat.

### Nichts geht verloren

1. **Jede Eingabe** wird sofort in `localStorage` gespeichert. Neuladen, Tab schließen oder
   Handy-Neustart: Beim nächsten Öffnen kommt „Kontynuuj“. Ein angefangener Test kann nicht
   versehentlich von einem Geschwisterkind überschrieben werden; dafür muss man ihn ausdrücklich
   „Porzuć“ (verwerfen).
2. **Beim Absenden** kommt das Ergebnis zuerst in eine Warteschlange (`outbox.js`). Erst danach
   wird gesendet. Bei Fehlern wird nach 5 s, 15 s, 30 s, 1, 2 und dann alle 5 min erneut versucht,
   sofort wenn das Handy wieder online ist und bei jedem Öffnen der Seite.
3. **Doppelte Zeilen** verhindert eine Abgabe-ID: Kommt dieselbe Abgabe zweimal an (z. B. weil
   die erste Antwort unterwegs verloren ging), speichert das Script sie nur einmal.
4. **Letzte Rückfallebene:** Klappt das Senden nicht, zeigt die Ergebnisseite den Knopf
   „Kopiuj wynik“ mit dem Ergebnis als Text für WhatsApp.
5. **„Następne dziecko“** setzt nur den Test zurück, nicht die Warteschlange. Das nächste Kind kann
   sofort anfangen, auch wenn das vorige Ergebnis noch auf Netz wartet.
6. **Doppelt-Warnung:** Will jemand mit einem Namen starten, für den von diesem Gerät schon ein
   Ergebnis gesendet wurde, erscheint ein Hinweis. Ein zweiter Druck startet trotzdem. Auf der
   Lehrerseite sind mehrfache Namen mit „2×“ markiert.

### Offline

Der Service Worker (`sw.js`) speichert beim ersten Besuch alle Dateien und alle Tests.
App-Dateien kommen danach sofort aus dem Speicher und werden im Hintergrund aktualisiert.
Tests und `config.json` werden zuerst aus dem Netz geholt (neue Tests sind sofort da) und offline
aus dem Speicher. Getestet mit gestopptem Server in Chrome: Seite lädt, Test läuft, Ergebnis wird
nach Rückkehr des Servers automatisch nachgesendet.

### Bewertung

| Typ | Punkte |
|---|---|
| `mc`, `fill` | `points` bei richtiger Antwort |
| `table` | 1 pro richtigem Feld |
| `order` | 2 wenn alles stimmt, 1 ab 70 % richtiger Positionen |
| `open` | 0 automatisch, du vergibst auf der Lehrerseite 0–`manualMax` (auch halbe Punkte) |

Die Logik steckt in `public/js/grading.js` und ist durch `test/grading.test.js` abgedeckt:
voller Durchlauf = 40, leerer = 0, Teilpunkte bei `order` und `table`, Rundung bei 70 %.

### Sicherheit und Datenschutz

- Gespeichert werden nur **Vorname, Alter, Sprache, Antworten, Punkte, Zeitstempel**. Kein Tracking,
  keine Fremd-Skripte, keine externen Schriften, kein Cookie.
- Die Daten liegen in **deinem** Google Sheet.
- Lehrerseite: Das Passwort prüft das Apps Script. Gespeichert ist nur ein gesalzener SHA-256-Hash.
  Nach 10 Fehlversuchen ist die Seite 15 Minuten gesperrt. Die Seite selbst enthält keine Daten.
- Abgaben: Token, Format- und Längenprüfung, höchstens 120 Abgaben pro Minute. Namen, die wie
  Tabellenformeln aussehen (`=…`), werden entschärft.
- Der Token steht im Quelltext der Seite und ist damit **kein** Geheimnis. Er hält
  Zufallsfunde und Bots ab, nicht jemanden, der gezielt die Seite untersucht.

### Gestaltung

Systemschriften (Segoe UI, Roboto, San Francisco, Noto). Sie bringen alle polnischen Zeichen
mit und laden ohne Netz. Geprüft mit `ą ć ę ł ń ó ś ź ż` in Überschriften, Antworten und Namen.
Hell- und Dunkelmodus folgen dem Handy oder lassen sich umschalten. Jedes Kapitel hat eine
eigene Farbe, die sich durch Fortschrittsbalken, Aufgaben, Ergebnis und Lehrerseite zieht. Alle Texte
erreichen mindestens WCAG-AA-Kontrast. Tippflächen sind mindestens 44 px groß, alles ist per Tastatur
bedienbar, der Fokus ist sichtbar, und `prefers-reduced-motion` schaltet Animationen ab.

---

## Bewusst nicht gebaut

| Was | Warum |
|---|---|
| Lösungen nur auf dem Server | Die Ergebnisseite soll sofort und auch offline zeigen, was richtig war. Dafür müssen die Lösungen im Browser sein. Ein technisch versiertes Kind könnte sie im Quelltext finden. Bei 9–12-Jährigen und einem Übungstest halte ich das für vertretbar. |
| Senden bei geschlossener Seite (Background Sync) | Nur in Chrome verfügbar und deutlich komplexer. Stattdessen wird bei jedem Öffnen der Seite und bei jeder Rückkehr ins Netz gesendet. Ergebnisse sind bis dahin sicher gespeichert. |
| XLSX-Export | Die CSV öffnet sich in Excel mit korrekten Umlauten und polnischen Zeichen. Eine echte XLSX liefert das Google Sheet selbst: Datei → Herunterladen → Microsoft Excel. Eine XLSX-Bibliothek wäre Fremdcode. |
| Ergebnisse löschen/ändern auf der Lehrerseite | Das geht direkt im Google Sheet (Zeile löschen). So gibt es keinen Lösch-Endpunkt, den jemand missbrauchen könnte. |
| Benutzerkonten / mehrere Lehrer | Nicht verlangt. Ein Passwort reicht laut Auftrag. |
| Eigene Webfonts | Systemschriften sind auf jedem Handy vorhanden, decken Polnisch ab und kosten 0 Bytes. Das erfüllt „nichts von einem CDN abhängig“ am einfachsten. |
| Zeitlimit, zufällige Reihenfolge | Nicht verlangt. Zufällige Reihenfolge würde auch den Vergleich zwischen Geschwistern am selben Handy erschweren. |
| Fragen-Editor im Browser | JSON + Validator + automatische Prüfung bei GitHub erfüllen „ohne Code anfassen“ mit deutlich weniger Fehlerquellen. |
| Build-Werkzeuge, Frameworks | Nicht nötig. Rund 100 KB unkomprimiert (gzip ca. 30 KB), startet auf alten Handys schnell. |

## Bekannte Grenzen

- **iPhone / Safari:** Safari löscht gespeicherte Seitendaten, wenn eine Seite 7 Tage nicht geöffnet
  wurde. Ein Ergebnis, das offline abgeschickt und eine Woche lang nie nachgesendet wurde, könnte
  dort verloren gehen. Normalerweise wird es beim nächsten Öffnen mit Netz sofort gesendet.
- **Privater Modus / Inkognito:** Ein Neuladen übersteht der Test dort nicht immer. Bitte den Link
  normal öffnen.
- **Teilpunkt bei `order` mit 4 oder 5 Kacheln** (Aufgaben 33 und 34): mathematisch nicht
  erreichbar. Jede falsche Reihenfolge vertauscht mindestens zwei Kacheln, und 70 % von 4 bzw. 5
  sind 3 bzw. 4 richtige Positionen. Die Regel wirkt nur bei Aufgabe 13 (8 Kacheln).
