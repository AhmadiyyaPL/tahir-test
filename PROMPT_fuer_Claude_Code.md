# Auftrag: Online-Testsystem für den Kinderunterricht (Tahir Academy)

Du baust mir ein kleines, aber produktionsreifes Testsystem für meinen wöchentlichen
Religionsunterricht. Arbeite autonom. Frage nur bei den drei Punkten nach, die unter
**„Was du mich fragen musst"** stehen — alles andere entscheidest du selbst.

---

## 1. Kontext

Ich unterrichte samstags über Google Meet Kinder von 9–12 Jahren. Unterrichtssprache ist
**Polnisch**, das Lehrbuch (Tahir Academy Workbook Level 2, Part I) ist auf **Englisch**.
Die Kinder sitzen zu Hause, teilweise mehrere Geschwister an einem Gerät. Die wenigsten
haben einen Drucker. Keines der Kinder hat irgendeinen Account — sie bekommen einen Link
per WhatsApp und das muss reichen.

Geprüft wird Teil I des Workbooks mit vier Kapiteln:
1. The Holy Qur'an
2. Salat and Prayers
3. Basics of Islam
4. History of Islam

Der komplette Fragenkatalog liegt fertig bei: **`pytania.json`** (35 Aufgaben, 40 Punkte,
zweisprachig PL/EN, inkl. Lösungen). Inhaltlich ist der Katalog abgenommen — ändere die
Fragen nicht, ohne mich zu fragen.

Als Referenz liegt außerdem **`test-referencja.html`** bei: eine funktionierende
Einzeldatei-Version. Logik und Inhalt stimmen dort; Design und Architektur darfst und
sollst du besser machen.

---

## 2. Das eigentliche Problem

Die Referenzversion kann **die Ergebnisse nicht speichern**. Die Kinder müssen mir ihr
Ergebnis von Hand per WhatsApp schicken. Genau das soll weg.

**Kernanforderung: Das Kind drückt am Ende „Absenden", und das Ergebnis landet
automatisch bei mir — ohne Login, ohne Screenshot, ohne Abtippen.**

---

## 3. Architektur

Trenne Schülerseite, Lehrerseite und Datenhaltung sauber.

**Backend (Vorschlag, wenn du nichts Besseres findest):**
Google Apps Script Web App als JSON-Endpoint, der in ein Google Sheet schreibt.

* Ich habe ein Google-Konto, also entstehen keine Hosting-Kosten und keine Accounts.
* `doPost(e)` nimmt das Ergebnis entgegen und hängt eine Zeile ans Sheet.
* Deployment als Web-App mit „Execute as: me" und „Who has access: Anyone".
* Achtung auf den bekannten CORS-Fallstrick: Apps Script beantwortet keinen Preflight.
  Also entweder `Content-Type: text/plain` senden und serverseitig `JSON.parse`,
  oder `no-cors` mit Form-Encoding. Löse das sauber und dokumentiere es.
* Baue einen Shared-Secret-Token ein, damit nicht jeder, der den Endpoint findet,
  Müll ins Sheet schreiben kann.

Wenn du eine deutlich bessere Lösung kennst (Cloudflare Workers + D1, Supabase, …),
schlag sie mir mit Begründung vor — **aber frage vorher**, bevor du sie baust.
Harte Bedingung in jedem Fall: dauerhaft kostenlos oder nahezu kostenlos, keine
Account-Pflicht für die Kinder, Daten unter meiner Kontrolle.

**Robustheit — das ist mir wichtiger als jedes Feature:**

* Wenn das Absenden fehlschlägt (kein Netz, Endpoint tot), darf das Kind sein Ergebnis
  **nicht** verlieren. Ergebnis lokal zwischenspeichern, automatisch erneut versuchen,
  und als letzte Rückfallebene den Kopieren-Knopf wie in der Referenzversion anzeigen.
* Ein Testdurchlauf muss einen Browser-Neustart oder ein versehentliches Neuladen
  überleben.
* Nichts darf von einer CDN-Verbindung abhängen, die ausfallen kann. Wenn möglich
  Schriften und alles andere mit ausliefern.

---

## 4. Schülerseite

* Startbildschirm: Sprache wählen (Polski / English), Name, Alter. Kein Login.
* Die komplette Oberfläche existiert in beiden Sprachen, inklusive aller Fragen.
  Sprache muss auch mitten im Test umschaltbar sein, ohne Antwortverlust.
* Eine Aufgabe pro Bildschirm, Fortschrittsbalken, Zurückblättern erlaubt.
* **Fünf Aufgabentypen** (alle schon in `pytania.json` modelliert):
  * `mc` — Multiple Choice, eine richtige Antwort.
  * `fill` — Zahl eintippen.
  * `order` — Kacheln in die richtige Reihenfolge bringen (Wudu-Schritte,
    Propheten-Reihenfolge, Khulafa Rashidun). Antippen vergibt die nächste Nummer,
    erneutes Antippen nimmt zurück, „Löschen" setzt die Aufgabe zurück.
    Auf dem Desktop zusätzlich Drag & Drop, auf dem Handy bleibt es beim Antippen.
  * `table` — Rakaat-Tabelle, in der einzelne Zahlen fehlen und eingetippt werden.
  * `open` — Freitext, 1–3 Sätze. Wird **nicht** automatisch bewertet.
* Bewertung: `points` pro Aufgabe aus der JSON. Bei `order` zwei Punkte für komplett
  richtig, ein Punkt ab 70 % richtiger Positionen. Bei `table` ein Punkt pro Feld.
  `open` zählt null automatische Punkte und wird für mich zur Bewertung markiert.
* Ergebnisseite: Punktzahl, Aufschlüsselung nach den vier Kapiteln, und zu jeder
  falschen Aufgabe die richtige Lösung — die Kinder sollen aus dem Test lernen.
* Nach dem Absenden ein deutlicher Knopf **„Nächstes Kind"**, der alles zurücksetzt.
  Das ist der Normalfall, nicht die Ausnahme: in einer Familie machen zwei bis drei
  Kinder den Test nacheinander auf demselben Handy.
* Erkennen und sichtbar machen, wenn ein Ergebnis schon abgeschickt wurde, damit
  niemand versehentlich doppelt sendet.

---

## 5. Lehrerseite

Eine zweite, passwortgeschützte Seite für mich:

* Tabelle aller Ergebnisse: Name, Alter, Datum, Sprache, Punkte, Prozent, Kapitelwerte.
* Die Freitextantworten im Volltext, mit einem Feld, in dem ich Punkte vergebe und
  einen kurzen Kommentar schreibe. Die Bewertung wird zurückgespeichert.
* **Auswertung über alle Kinder pro Aufgabe:** bei welchen Fragen lagen die meisten
  falsch. Das sagt mir, was ich im Unterricht nochmal durchgehen muss — das ist der
  für mich wertvollste Teil.
* Export als XLSX oder CSV.
* Simples Passwort reicht; das sind keine sensiblen Daten, aber offen rumliegen soll
  es auch nicht.

---

## 6. Inhalt erweiterbar halten

Ich will später weitere Tests ergänzen (Part II, Waqf-e-Nau-Klasse, andere Altersgruppen),
**ohne dass du oder ich Code anfassen müssen.**

* Alle Inhalte in JSON-Dateien wie `pytania.json`, ein Test pro Datei.
* Das Schema dokumentieren, inklusive wie man einen neuen Aufgabentyp ergänzt.
* Ein Validierungsskript, das eine Inhaltsdatei prüft, bevor sie live geht:
  Pflichtfelder, gültige Lösungsindizes, beide Sprachen überall gefüllt,
  `points` passend zum Typ, bei `order` eine echte Permutation.
  Das Skript muss ohne Argumente laufen und im Fehlerfall klar sagen, welche
  Aufgabennummer kaputt ist.
* Die Startseite listet alle verfügbaren Tests, wenn mehr als einer da ist.

---

## 7. Design

Ziel ist etwas, das Kinder gern benutzen und das nicht nach Behördenformular aussieht.

* Mobile first. Die meisten machen das auf dem Handy der Eltern.
* Große Tippflächen, klare Typografie, Hell- und Dunkelmodus.
* Die vier Kapitel bekommen je eine eigene Farbe, die sich konsistent durchzieht.
* Eine ruhige, warme Farbwelt. Keine Kindergarten-Optik — die Kinder sind 9–12
  und wollen nicht wie Kleinkinder behandelt werden.
* Barrierefreiheit: Tastaturbedienung, sichtbarer Fokus, ausreichender Kontrast,
  `prefers-reduced-motion` respektieren.
* Polnische Diakritika müssen in jeder verwendeten Schrift sauber dargestellt werden
  (ą ć ę ł ń ó ś ź ż) — bitte wirklich prüfen, nicht annehmen.

---

## 8. Technische Rahmenbedingungen

* Keine schweren Frameworks, wenn es ohne geht. Die Seite muss auf einem alten
  Android-Handy in unter zwei Sekunden starten.
* Kein Tracking, keine Drittanbieter-Skripte. Es sind Kinderdaten: gespeichert wird
  nur, was für die Auswertung gebraucht wird — Vorname, Alter, Antworten, Zeitstempel.
* Alles muss ohne Internetverbindung weiterlaufen, sobald die Seite einmal geladen ist
  (Service Worker). Gesendet wird, sobald wieder Netz da ist.
* Tests für die Bewertungslogik: perfekter Durchlauf gibt die volle Punktzahl,
  leerer Durchlauf null, Teilpunkte bei `order` und `table` stimmen.

---

## 9. Was du mir liefern sollst

1. Das lauffähige Projekt im Repository, mit klarer Ordnerstruktur.
2. `README.md` mit Setup, Deployment und wie ich einen neuen Test hinzufüge.
3. `DEPLOY.md`: Schritt für Schritt, was ich im Browser klicken muss, um das Backend
   aufzusetzen. Schreib es für jemanden, der kein Entwickler ist — ich kann mit einem
   Terminal umgehen, aber ich will nicht raten müssen, welchen Google-Menüpunkt du meinst.
4. Den Apps-Script-Code (oder was immer das Backend wird) als eigene Datei zum Einfügen.
5. Das Validierungsskript aus Punkt 6.
6. Eine kurze Liste dessen, was du bewusst **nicht** gebaut hast, und warum.

---

## 10. Was du mich fragen musst

Diese drei Punkte entscheide **nicht** allein:

1. **Hosting der Schülerseite.** Zur Auswahl stehen: GitHub Pages, Cloudflare Pages,
   ein eigener Server bei mir zu Hause, oder ein Unterverzeichnis auf einer meiner
   bestehenden WordPress-Seiten. Jede Option hat andere Folgen für Domain, HTTPS und
   Wartung — leg mir die Varianten mit Vor- und Nachteilen vor und lass mich wählen.
2. **Backend.** Wenn du etwas anderes als Google Apps Script nehmen willst: begründen
   und fragen, vorher nicht bauen.
3. **Inhaltliche Änderungen am Fragenkatalog.** Wenn dir ein Fehler auffällt oder eine
   Frage unklar formuliert ist: sag es mir, ändere sie aber nicht eigenmächtig.

---

## 11. Vorgehen

Fang mit einem kurzen Plan an: Architektur, Ordnerstruktur, die offenen Fragen aus
Punkt 10. Danach arbeite durch, ohne mich bei jedem Schritt zu fragen.

Wenn etwas aus diesem Auftrag technisch nicht geht oder sich widerspricht, sag mir das
früh und schlag eine Alternative vor — bau nicht still etwas anderes.
