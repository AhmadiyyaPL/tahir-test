# Aufbau einer Testdatei (`public/tests/*.json`)

Ein Test = eine Datei. Der Dateiname muss `<meta.id>.json` sein, z. B. `czesc-2.json`.
Alle Texte, die Kinder sehen, stehen immer in **beiden** Sprachen:
`{ "pl": "…", "en": "…" }`.

Nach jeder Änderung:

```bash
node tools/validate.js
```

Das Skript prüft alle Testdateien, nennt bei Fehlern die **Aufgabennummer** und schreibt
`public/tests/index.json` neu (die Liste auf der Startseite). `index.json` nie von Hand bearbeiten.

---

## Gerüst

```json
{
  "meta": {
    "id": "czesc-2",
    "title":    { "pl": "Test — część II", "en": "Test — Part II" },
    "subtitle": { "pl": "Tahir Academy · Poziom 2", "en": "Tahir Academy · Level 2" },
    "pointsMax": 40,
    "order": 2,
    "active": true
  },
  "sections": [
    { "id": 0, "pl": "Święty Koran", "en": "The Holy Qur'an" },
    { "id": 1, "pl": "Salat i modlitwy", "en": "Salat and Prayers" }
  ],
  "items": [ … ]
}
```

| Feld | Pflicht | Bedeutung |
|---|---|---|
| `meta.id` | ja | Kleinbuchstaben, Ziffern, `-`. Gleich dem Dateinamen. **Nach dem ersten Einsatz nicht mehr ändern** — die Ergebnisse im Sheet hängen an dieser ID. |
| `meta.title` | ja | Überschrift auf der Startseite |
| `meta.subtitle` | nein | kleine Zeile über dem Titel |
| `meta.pointsMax` | ja | Summe aller `points`. Der Validator rechnet nach. |
| `meta.order` | nein | Reihenfolge in der Testliste (kleiner = weiter oben) |
| `meta.active` | nein | `false` blendet den Test auf der Startseite aus (alte Ergebnisse bleiben auf der Lehrerseite sichtbar) |
| `sections` | ja | Kapitel. Die Farbe ergibt sich aus der Position (1. = grün, 2. = blau, 3. = ocker, 4. = violett, 5. = rot, 6. = oliv). |

## Gemeinsame Felder jeder Aufgabe

| Feld | Pflicht | Bedeutung |
|---|---|---|
| `n` | ja | Nummer 1, 2, 3 … lückenlos in Dateireihenfolge |
| `section` | ja | `id` eines Kapitels |
| `type` | ja | `mc`, `fill`, `order`, `table` oder `open` |
| `points` | ja | Punkte (Regeln je Typ unten) |
| `prompt` | ja | Fragetext `{pl, en}` |
| `help` | nein | Hinweiszeile unter der Frage `{pl, en}` |

## Die fünf Typen

### `mc` — eine richtige Antwort

```json
{ "n": 1, "section": 0, "type": "mc", "points": 1,
  "prompt": { "pl": "Co znaczy słowo „Koran”?", "en": "What does the word “Qur'an” mean?" },
  "options": [
    { "pl": "Święta księga Boga", "en": "God's holy book" },
    { "pl": "Często czytany lub recytowany", "en": "Often read or recited" }
  ],
  "correct": 1 }
```
`correct` zählt ab **0** (erste Antwort = 0). 2–8 Antworten. `points` ≥ 1.

### `fill` — Zahl (oder kurzes Wort) eintippen

```json
{ "n": 5, "section": 0, "type": "fill", "points": 1,
  "prompt": { "pl": "Ile części (dżuz) ma Koran?", "en": "How many parts (juz) does the Holy Qur'an have?" },
  "accept": ["30"],
  "unit": { "pl": "części", "en": "parts" } }
```
`accept`: alle Schreibweisen, die richtig sind. Groß/klein, Leerzeichen und ein Punkt am Ende
werden ignoriert. Die erste Schreibweise wird den Kindern als Lösung gezeigt.
Das Eingabefeld öffnet auf dem Handy die Zahlentastatur.

### `order` — Kacheln sortieren

```json
{ "n": 34, "section": 3, "type": "order", "points": 2,
  "prompt": { "pl": "Ustaw Khulafa Rashidun w poprawnej kolejności", "en": "Put the Khulafa Rashidun in the correct order" },
  "tiles": [
    { "pl": "Hadrat Umar (ra)", "en": "Hadrat Umar (ra)" },
    { "pl": "Hadrat Ali (ra)", "en": "Hadrat Ali (ra)" },
    { "pl": "Hadrat Abu Bakr (ra)", "en": "Hadrat Abu Bakr (ra)" },
    { "pl": "Hadrat Uthman (ra)", "en": "Hadrat Uthman (ra)" }
  ],
  "correctOrder": [2, 0, 3, 1] }
```
`tiles` steht in der Reihenfolge, in der die Kinder sie **sehen** (also gemischt).
`correctOrder` listet die Kachel-Indizes (ab 0) in der **richtigen** Reihenfolge.
`points` ist immer 2: 2 = alles richtig, 1 = mindestens 70 % der Positionen richtig.

> Hinweis: Bei 4 oder 5 Kacheln ist ein Teilpunkt nicht erreichbar (jeder Fehler vertauscht
> mindestens zwei Kacheln). Der Validator weist darauf hin. Ab 7 Kacheln greift die 70-%-Regel.

### `table` — Lücken in einer Tabelle

```json
{ "n": 12, "section": 1, "type": "table", "points": 2,
  "prompt": { "pl": "Uzupełnij tabelę rakaatów", "en": "Fill in the rak'ah table" },
  "help": { "pl": "Wpisz brakujące liczby w pomarańczowe pola.", "en": "Type the missing numbers into the orange boxes." },
  "columns": [ { "pl": "Sunnah", "en": "Sunnah" }, { "pl": "Fard", "en": "Fard" } ],
  "rows": [
    { "name": { "pl": "Fajr", "en": "Fajr" }, "cells": ["2", null], "blanks": [ { "col": 1, "answer": "2" } ] },
    { "name": { "pl": "Zuhr", "en": "Zuhr" }, "cells": [null, "4"], "blanks": [ { "col": 0, "answer": "4" } ] }
  ] }
```
`cells` hat genau so viele Einträge wie `columns`. `null` = Lücke, und zu jeder Lücke gehört ein
Eintrag in `blanks` mit derselben Spalte. `points` = Anzahl der Lücken (1 Punkt pro Feld).
Lückenfelder sind orange umrandet.

### `open` — Freitext, Bewertung durch dich

```json
{ "n": 17, "section": 1, "type": "open", "points": 0, "grading": "manual", "manualMax": 2,
  "prompt": { "pl": "Dlaczego przed modlitwą wykonujemy wudu? Odpowiedz w 1–3 zdaniach.",
              "en": "Why do we perform wudu before prayer? Answer in 1–3 sentences." } }
```
`points` ist immer 0 (keine automatische Bewertung). `manualMax` = höchste Punktzahl,
die du auf der Lehrerseite vergeben kannst (0–20). Die Gesamtpunktzahl auf der Lehrerseite ist
`pointsMax + Summe aller manualMax`.

---

## Einen neuen Aufgabentyp ergänzen (Programmierarbeit)

Ein neuer Typ braucht Code an genau diesen Stellen. Am Beispiel eines Typs `multi`
(mehrere richtige Antworten):

1. **`public/js/grading.js`**: in `blankAnswer`, `sanitizeAnswer`, `isAnswered`, `gradeItem`,
   `describeAnswer`, `describeCorrect` je einen `case 'multi':` ergänzen und `'multi'` in `TYPES`
   aufnehmen. `gradeItem` muss `{ got, max }` liefern, dann funktionieren Ergebnisseite,
   Kapitelwerte, Sheet, CSV und Auswertung automatisch.
2. **`public/js/student.js`**: eine Funktion `bodyMulti(item, v)` schreiben, die das Eingabe-Element
   baut und bei jeder Änderung `setAnswer(item, neuerWert)` aufruft. In `paintBody` eintragen.
3. **`public/js/i18n.js`**: Hinweistext unter `hint.multi` in `pl` und `en`.
4. **`tools/validate.js`**: `'multi'` in `TYPES` und einen `case 'multi':` mit den Pflichtfeldern.
5. **`test/grading.test.js`**: Tests für richtig / falsch / teilweise.
6. Optional **`public/js/teacher.js`** → `viewStats`: eine typ-spezifische Detailzeile.
7. `node tools/validate.js && node --test` — beides muss grün sein.

Das Backend (`Code.gs`) muss für neue Typen nicht geändert werden: Es speichert Antworten
und Punkte als JSON, egal welcher Typ.
