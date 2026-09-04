# Daten und Sicherheit

## Speicherorte

Der lokale Server verwendet standardmäßig:

```text
apps/server/data/tab-orga.sqlite   Anwendungsdaten
apps/server/auth.json              Codex-OAuth-Zugangsdaten
```

`TAB_ORGA_DATA_DIR` und `TAB_ORGA_AUTH_FILE` können diese Pfade ändern. Docker Compose bindet das
Datenverzeichnis nach `/data` und die Auth-Datei separat in den Container ein. Image-Neubauten
löschen deshalb weder Anwendungsdaten noch OAuth-Anmeldung.

## SQLite-Daten

SQLite läuft mit Write-Ahead Logging und aktivierten Foreign Keys. Die wesentlichen Tabellen sind:

| Tabelle | Inhalt |
|---|---|
| `settings` | allgemeiner Prompt und gewünschte Gruppentitellänge |
| `rules` | deterministische URL-zu-Gruppe-Regeln |
| `memories` | dauerhafte Organisationspräferenzen |
| `summary_cache` | Zusammenfassungen, Stage-1-/Stage-2-Profile, Fingerprints und Fehler-Cooldowns |
| `stored_tab_sets` | Metadaten gespeicherter Gruppen |
| `stored_tabs` | geordnete Tabs eines gespeicherten Sets |

Tabs eines gespeicherten Sets werden beim Löschen des Sets per Foreign-Key-Cascade entfernt. Eine
normalisierte URL darf innerhalb desselben Sets nur einmal vorkommen.

Beim Start kann der Server Daten aus älteren JSON-Speicherformaten übernehmen. Danach ist SQLite
die maßgebliche Quelle.

## OAuth-Zugangsdaten

Die Auth-Datei gehört ausschließlich zum lokalen Server und wird nie an die Chromium-Erweiterung
ausgeliefert. Änderungen erfolgen atomar über eine temporäre Datei und Umbenennung; die Datei wird
mit Modus `0600` angelegt. Zugriffe pro Provider werden serialisiert, damit parallele Token-Updates
einander nicht überschreiben.

Die Datei darf nicht committed, in Logs ausgegeben oder mit anderen Benutzern geteilt werden. Nach
einem Verlust kann sie mit folgendem Befehl neu erzeugt werden:

```bash
pnpm pi:login
```

## Welche Inhalte verlassen den Browser?

Der Browser sendet an den lokalen Server je nach Funktion:

- Titel und URLs der zu analysierenden Tabs,
- Stage-1-Metadaten,
- auf gezielte Anfrage Überschriften und bereinigten Seiteninhalt,
- bei ausdrücklich aktivierter Stage 2 komprimierte Screenshots,
- Benutzeranweisungen, Feedback, Regeln und Memories.

Für die KI-Funktionen leitet der lokale Server die erforderlichen Daten über den
`openai-codex`-Provider an OpenAI weiter. Die SQLite-Datenbank selbst bleibt lokal. Eine reine
manuelle Browseraktion wie Drag-and-drop benötigt keinen KI-Aufruf.

Die Suchfunktion extrahiert Inhalte zunächst lokal in der Erweiterung und verwendet gecachte
Zusammenfassungen. Eine Suchanfrage allein sendet den vollständigen Seiteninhalt nicht automatisch
an das Modell. Bei einem späteren Organize-Lauf kann der Agent gezielt Inhalt eines mehrdeutigen
Tabs anfordern.

## Netzwerkgrenze

Der Server bindet standardmäßig nur an `127.0.0.1:7777`. Dabei sollte es bleiben. Die API besitzt
keine Benutzeranmeldung oder Mandantentrennung und darf nicht direkt ins LAN oder Internet
veröffentlicht werden.

CORS erlaubt bei gesetztem `TAB_ORGA_EXTENSION_ID` die konfigurierte Extension-Origin. Ohne feste
ID werden Chromium-Extension-Origins sowie lokale Loopback-HTTP-Origins akzeptiert. CORS schützt
Browserzugriffe, ist aber keine Authentifizierung gegenüber lokalen Kommandozeilenprogrammen oder
anderer Software auf dem Rechner.

Der Content-Bridge besitzt zusätzlich ein zufälliges Token pro Serverstart. Der Server vertraut
entweder der konfigurierten Extension-Origin oder bindet sich ohne Konfiguration an die erste
passende Extension-Origin. Das Token schützt den internen Nachrichtenfluss, ersetzt jedoch keine
allgemeine API-Authentifizierung.

## Validierung und Modellgrenzen

Zod begrenzt Requests, Stringlängen, Batchgrößen und erlaubte Enum-Werte. Die KI darf Gruppierungen
nur über strukturierte Tools einreichen. Der Server prüft Tab- und Gruppen-IDs, entfernt ungültige
Referenzen und erzwingt Regeln erneut nach dem Modellaufruf.

Webseitentitel, URLs, Metadaten, Text und Screenshots gelten im Prompt als nicht vertrauenswürdige
Evidenz. Darin enthaltene Aufforderungen dürfen keine System-, Benutzer- oder Regelanweisungen
überschreiben. Dieser Schutz reduziert das Prompt-Injection-Risiko, kann es bei modellbasierten
Systemen aber nicht mathematisch ausschließen. Die Vorschau vor **Apply** bleibt daher eine
wichtige Sicherheitsgrenze.

## Screenshots und geschützte Inhalte

Stage 2 ist opt-in. Ein Screenshot kann sichtbare persönliche, interne oder vertrauliche Inhalte
enthalten. Vor der Aktivierung sollte geprüft werden, welche Tabs offen sind. Interne
Chromium-Seiten und nicht unterstützte Schemes werden nicht als normale Webseiten verarbeitet;
Anmeldeseiten oder Webanwendungen können jedoch grundsätzlich aufgenommen werden, wenn sie als
gewöhnliche HTTP(S)-Seite sichtbar sind.

## Logs

Im normalen Betrieb werden Serverstatus und Fehlermeldungen ausgegeben. Mit
`TAB_ORGA_DEBUG=1` entstehen ausführlichere Diagnosen; optional schreibt der Organize-Lauf in die
über `TAB_ORGA_ORGANIZE_LOG_FILE` konfigurierte Datei. Debug-Daten können URLs, Titel,
Anweisungsanteile oder technische Modellantworten enthalten. Debugging nur kurzzeitig aktivieren
und Logdateien anschließend kontrolliert löschen.

## Backup und Wiederherstellung

Für eine vollständige lokale Sicherung werden benötigt:

```text
apps/server/data/
apps/server/auth.json
apps/extension/.local/tab-pilot.pem
```

Die SQLite-Datenbank sollte bei gestopptem Container kopiert werden, damit Datenbank, WAL und
Shared-Memory-Dateien konsistent sind:

```bash
docker compose stop tab-pilot-server
cp -a apps/server/data /sicherer/pfad/tab-pilot-data
docker compose start tab-pilot-server
```

Der private PEM-Schlüssel bestimmt die Extension-ID. Sein Verlust ändert nicht die SQLite-Daten,
führt beim nächsten Packen aber zu einer anderen Erweiterung, die Chromium als separates Produkt
behandelt. Auth-Datei und PEM-Schlüssel müssen besonders geschützt werden.

Zur Wiederherstellung den Server stoppen, das Datenverzeichnis und gegebenenfalls die Auth-Datei
zurückkopieren und den Server wieder starten. Niemals eine fremde oder nicht vertrauenswürdige
SQLite- oder Auth-Datei übernehmen.

