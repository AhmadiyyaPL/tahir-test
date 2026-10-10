# Einrichten — Schritt für Schritt

Dauer: etwa 30 Minuten, einmalig. Du brauchst: dein Google-Konto, ein GitHub-Konto
(kostenlos, <https://github.com/signup>) und ein Terminal.

Übersicht:

| Teil | Was | Wo |
|---|---|---|
| A | Google Sheet + Backend anlegen | Browser, Google |
| B | Backend als Web-App freigeben | Browser, Apps Script |
| C | Zugangsdaten in `public/config.json` eintragen | Editor |
| D | Seite auf GitHub Pages veröffentlichen | Terminal + Browser, GitHub |
| E | Generalprobe | Handy |

Die Menünamen unten sind die der **deutschen** Google-Oberfläche. In Klammern steht der
englische Name, falls dein Konto auf Englisch läuft.

---

## A — Google Sheet und Backend anlegen

1. Öffne <https://sheets.new>. Es entsteht eine leere Tabelle.
2. Klicke oben links auf **„Unbenannte Tabelle“** und tippe einen Namen, z. B.
   `Tahir Test – Ergebnisse`. Enter.
3. Menü **Erweiterungen → Apps Script** (*Extensions → Apps Script*).
   Ein neuer Tab mit dem Script-Editor öffnet sich.
4. Klicke oben links auf **„Unbenanntes Projekt“** und nenne es `Tahir-Test`. **Umbenennen**.
5. Im Editor siehst du die Datei **Code.gs** mit ein paar Zeilen (`function myFunction() …`).
   Markiere alles (**Strg + A**) und lösche es.
6. Öffne aus diesem Projekt die Datei **`backend/Code.gs`** (z. B. mit dem Editor oder Notepad),
   markiere alles, kopiere es und füge es im Script-Editor ein.
7. Speichern: **Strg + S** (oder das Disketten-Symbol „Projekt speichern“).
8. Wechsle zurück zum Tab mit der Tabelle und **lade ihn neu** (F5).
   Nach ein paar Sekunden erscheint oben in der Menüleiste rechts von „Hilfe“ das Menü **„Tahir-Test“**.
9. **Tahir-Test → 1. Einrichten (einmalig)**.
10. Google fragt nach Berechtigungen. Das ist normal: Dein eigenes Script will in deine eigene
    Tabelle schreiben.
    - **„Autorisierung erforderlich“** → **OK** (*Continue*)
    - Dein Google-Konto anklicken
    - **„Google hat diese App nicht überprüft“** → unten links auf **„Erweitert“** (*Advanced*)
      → **„Zu Tahir-Test wechseln (unsicher)“** (*Go to Tahir-Test (unsafe)*)
    - **„Zulassen“** (*Allow*)
11. Oft passiert nach der Freigabe nichts weiter. Dann noch einmal
    **Tahir-Test → 1. Einrichten (einmalig)** wählen.
12. Es erscheint **„Lehrer-Passwort festlegen“**. Wähle ein Passwort mit mindestens 8 Zeichen.
    Damit öffnest du später die Lehrerseite. **OK**.
13. Meldung **„Einrichtung fertig“**. Unten in der Tabelle gibt es jetzt die Blätter
    **Ergebnisse** und **Bewertungen**. Das leere Blatt „Tabellenblatt1“ kannst du löschen
    (Rechtsklick auf den Reiter → Löschen).

## B — Backend als Web-App freigeben

1. Zurück zum **Apps-Script-Tab** (oder in der Tabelle: Erweiterungen → Apps Script).
2. Oben rechts der blaue Knopf **„Bereitstellen“** (*Deploy*) → **„Neue Bereitstellung“** (*New deployment*).
3. Links neben „Typ auswählen“ auf das **Zahnrad** klicken → **„Web-App“** (*Web app*).
4. Ausfüllen:
   - **Beschreibung:** `v1`
   - **Ausführen als** (*Execute as*): **Ich (deine@adresse)** (*Me*)
   - **Zugriff** (*Who has access*): **Jeder** (*Anyone*). Nicht „Jeder mit Google-Konto“,
     denn die Kinder haben keins.
5. **„Bereitstellen“** (*Deploy*). Falls noch einmal nach Zugriff gefragt wird: wie in A10 freigeben.
6. Es erscheint **„Web-App-URL“**, eine lange Adresse, die auf **`/exec`** endet.
   **Kopieren** und kurz irgendwo ablegen.
7. **Funktionstest:** Füge die URL in einen neuen Browser-Tab ein. Du solltest
   `{"ok":true,"service":"tahir-test","version":"1.0"}` sehen.

## C — Zugangsdaten eintragen

1. In der **Tabelle**: **Tahir-Test → 2. Zugangsdaten für config.json anzeigen**.
   Das Fenster zeigt einen kleinen Textblock mit `"endpoint"` und `"token"`.
   Falls dort `HIER-DIE-WEB-APP-URL-EINFÜGEN` steht, ersetze das durch die URL aus B6.
2. Öffne im Projekt die Datei **`public/config.json`** und ersetze ihren Inhalt durch diesen Block.
   Ergebnis z. B.:

   ```json
   {
     "endpoint": "https://script.google.com/macros/s/AKfy…/exec",
     "token": "3f9c…"
   }
   ```
3. Speichern.

> Der Token steht später öffentlich in der Seite. Das ist so gewollt: Er hält Bots fern, die
> die Adresse zufällig finden. Er ist kein Passwort. Dein Lehrer-Passwort steht nirgends im
> Klartext, im Script liegt nur ein Hash davon.

## D — Auf GitHub Pages veröffentlichen

### D1. Repository anlegen (Browser)

1. Bei GitHub anmelden → oben rechts **„+“ → „New repository“**.
2. **Repository name:** z. B. `tahir-test` (das wird Teil der Adresse).
3. **Public** auswählen. GitHub Pages ist nur für öffentliche Repositories kostenlos.
   Die Fragen sind damit öffentlich lesbar. Das sind sie aber ohnehin, denn jede Testseite
   liefert ihre Fragen an den Browser aus.
4. Nichts weiter ankreuzen → **„Create repository“**.
5. Die nächste Seite zeigt eine Adresse wie `https://github.com/DEINNAME/tahir-test.git`. Kopieren.

### D2. Dateien hochladen (Terminal, im Projektordner)

Der Ordner ist schon ein Git-Repository (Branch `main`), `git init` ist also nicht nötig.

```bash
cd "C:\Users\sadrp\OneDrive\Desktop\Claude\Kids lesson exam"
```

```bash
node tools/validate.js
```

```bash
node --test
```

Beides muss „Alles in Ordnung“ bzw. `fail 0` melden. Dann:

```bash
git add -A
```

```bash
git commit -m "Testsystem Teil I"
```

```bash
git remote add origin https://github.com/DEINNAME/tahir-test.git
```

```bash
git push -u origin main
```

Beim ersten `git push` öffnet sich ein Anmeldefenster von GitHub. Anmelden und bestätigen.

### D3. Pages einschalten (Browser)

1. Im Repository oben **„Settings“** → links **„Pages“**.
2. Unter **„Build and deployment“ → „Source“** wählen: **„GitHub Actions“**.
3. Oben auf **„Actions“** klicken. Dort läuft **„Prüfen und veröffentlichen“**. Nach etwa
   einer Minute erscheint ein grüner Haken.
   - Ist der Lauf vor dem Umschalten in D3.2 schon fehlgeschlagen: den Lauf öffnen →
     **„Re-run all jobs“**.
   - Bei rotem Kreuz im Schritt „Testdateien prüfen“: Eine Testdatei ist fehlerhaft, Details
     stehen im Protokoll. Die alte Version bleibt dann online.
4. Wieder **Settings → Pages**: oben steht **„Your site is live at
   https://DEINNAME.github.io/tahir-test/“**.

- **Link für die Kinder (WhatsApp):** `https://DEINNAME.github.io/tahir-test/`
- **Deine Lehrerseite:** `https://DEINNAME.github.io/tahir-test/lehrer.html`
  (nicht an die Kinder schicken; sie ist zwar passwortgeschützt, aber nicht nötig)

## E — Generalprobe (vor dem ersten Samstag!)

1. Kinder-Link auf deinem Handy öffnen, Namen `Probe` eintragen, Test durchklicken, **Wyślij wynik**.
   Es muss **„Wynik wysłany do nauczyciela ✓“** erscheinen.
2. Im Google Sheet, Blatt **Ergebnisse**: eine neue Zeile.
3. Lehrerseite öffnen, Passwort eingeben: Die Probe-Abgabe ist da. Eine offene Antwort bewerten
   → im Blatt **Bewertungen** erscheint eine Zeile.
4. Offline-Probe: Kinder-Link öffnen, **Flugmodus an**, Test machen, absenden.
   Es erscheint „Brak połączenia… wyślę automatycznie“. **Flugmodus aus**, die Seite offen lassen
   oder neu öffnen: Nach wenigen Sekunden steht dort ✓.
5. Die Probe-Zeilen im Sheet löschen (Zeilennummer rechts anklicken → Zeile löschen).

---

## Später

**Neuen Test hinzufügen:** siehe README → „Einen neuen Test hinzufügen“. Kurz gesagt:
JSON-Datei in `public/tests/` → `node tools/validate.js` → `git add -A`, `git commit`, `git push`.

**Backend-Code geändert** (z. B. neue Version von `Code.gs`):
Code einfügen, speichern → **Bereitstellen → Bereitstellungen verwalten** → Stift-Symbol
**„Bearbeiten“** → bei **Version** „**Neue Version**“ wählen → **Bereitstellen**.
Die URL bleibt gleich, `config.json` muss nicht geändert werden.
(Achtung: „Neue Bereitstellung“ würde eine **neue** URL erzeugen.)

**Passwort vergessen:** Tabelle → **Tahir-Test → Lehrer-Passwort ändern**.

**Lehrerseite gesperrt** („Zu viele Fehlversuche“): 15 Minuten warten.

**Zu viel Spam im Sheet:** **Tahir-Test → Neuen Token erzeugen**, neuen Token in
`public/config.json` eintragen, `git commit` + `git push`.

**Ergebnis kam per WhatsApp statt automatisch** (Notfall-Knopf „Kopiuj wynik“): Der Text
enthält Punkte, Kapitel, falsche Aufgaben und die offenen Antworten. Bei Bedarf trägst du ihn
von Hand ins Sheet ein. Sobald das Handy wieder Netz hat und die Seite geöffnet wird, kommt
das Ergebnis ohnehin automatisch. Doppelte Zeilen entstehen dabei nicht.
