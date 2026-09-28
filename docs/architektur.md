# Architektur

## Überblick

```text
┌──────────────────────────────────┐
│ Chromium                         │
│                                  │
│ Side Panel ── Service Worker     │
│ React UI      Tabs, Gruppen,     │
│               Cache-Jobs, Bilder│
└──────────────┬───────────────────┘
               │ HTTP + interner Content-Bridge
               ▼
┌──────────────────────────────────┐
│ Lokaler Hono-Server              │
│ API · Orchestrierung · Regeln    │
│ SQLite · OAuth Credential Store  │
└──────────────┬───────────────────┘
               │ Pi / Codex Responses
               ▼
┌──────────────────────────────────┐
│ OpenAI Codex                     │
│ Lead · Delegates · Tab-Profile   │
└──────────────────────────────────┘
```

Die Trennung hält Browserberechtigungen in der Erweiterung und KI-Zugangsdaten im lokalen Server.
Der Server kann keinen Tab direkt verschieben; die Erweiterung kann ihrerseits nicht auf das
Codex-OAuth-Token zugreifen.

## Repository

```text
.
├── apps/
│   ├── extension/
│   │   ├── manifest.json
│   │   ├── src/background/    # Service Worker und Analyse-Jobs
│   │   ├── src/content/       # Extraktion im Seitenkontext
│   │   └── src/sidepanel/     # React-Oberfläche
│   └── server/
│       ├── src/routes/        # Hono-API
│       ├── src/services/      # KI, Speicherung, Bridge, Credentials
│       └── data/              # lokale SQLite-Daten
├── packages/shared/           # gemeinsam verwendete TypeScript-Typen
├── scripts/                   # CRX-Packaging und Installation
├── docs/
└── compose.yaml
```

Das Projekt ist ein pnpm-Workspace. UI und Server sind TypeScript-Anwendungen; gemeinsame
Request-, Response- und Domänentypen liegen in `@tab-orga/shared`.

## Chromium-Erweiterung

Die Manifest-V3-Erweiterung verwendet unter anderem:

- `tabs` und `tabGroups` für Lesen und Ändern von Tabs und Gruppen,
- `sidePanel` für die React-Oberfläche,
- `scripting` für gezielte Seitenextraktion,
- `debugger` für die Screenshot-Aufnahme,
- `alarms` für wiederkehrende Stage-1-Jobs,
- `storage` für UI-Zustand und die Referenz auf einen laufenden Organize-Vorgang.

### Side Panel

Das Side Panel besitzt den sichtbaren Anwendungszustand: aktuelle Tabs und Gruppen, Suchindex,
Vorschläge, Feedback, Einstellungen, Memories und gespeicherte Sets. Browseränderungen gehen über
Service-Funktionen an die Chrome-APIs.

### Service Worker

Der Service Worker:

- plant Stage 1 beim Installieren und Starten sowie alle 15 Minuten,
- priorisiert bei **Organize** eine schnelle Stage-1-Runde,
- nimmt Stage-2-Screenshots nur nach ausdrücklicher Freigabe auf,
- kommuniziert mit dem lokalen Server,
- stellt Seiteninhalte für gezielte KI-Rückfragen bereit.

Stage 1 verwendet normalerweise Parallelität 4, im beschleunigten Lauf 10 und Server-Batches mit
höchstens 10 Tabs. Stage 2 nimmt höchstens zwei Screenshots gleichzeitig auf und übergibt sie in
KI-Batches von vier.

### Content-Extraktion

Für eine Seite können folgende Daten gelesen werden:

- Description, Open-Graph-Felder und Keywords,
- Canonical URL,
- bis zu zehn `h1`-/`h2`-Überschriften,
- bereinigter Text aus `main`, `article`, `[role=main]` oder als Rückfall aus `body`.

Navigation, Footer, Aside, Skripte und Styles werden entfernt; der bereinigte Text wird auf 6.000
Zeichen begrenzt. Ergebnisse gelangen über den Content-Bridge an den wartenden Serverlauf.

## Lokaler Server

Der Server basiert auf Hono, TypeScript, Zod, Drizzle und `node:sqlite`. Alle dokumentierten Routen
hängen unter `/api`; die vollständige Übersicht steht in [api.md](api.md).

Seine Zuständigkeiten sind:

- Requests validieren,
- Organisationsläufe verwalten,
- Regeln vor und nach der KI-Ausgabe erzwingen,
- strukturierte Codex-Aufrufe ausführen,
- Einstellungen, Memories, Sets und Profile speichern,
- OAuth-Zugangsdaten ausschließlich serverseitig lesen und aktualisieren,
- gezielte Inhaltsanfragen mit der Erweiterung vermitteln.

Asynchrone Organize-Läufe liegen im Arbeitsspeicher. Pro Browserfenster darf höchstens ein Lauf
aktiv sein. Abgeschlossene Läufe bleiben 30 Minuten verfügbar; insgesamt werden höchstens 100
abgeschlossene Einträge gehalten.

## Wichtige Kontrollflüsse

### Organize

```text
Side Panel
  → aktuelle Tabs/Gruppen lesen
  → schnellen Stage-1-Lauf anstoßen
  → POST /api/organize/runs
  → Server lädt Regeln, Memories, Einstellungen und Cache-Profile
  → Lead-Modell kann Inhalt oder Delegates anfordern
  → Server validiert und erzwingt Regeln
  → Side Panel zeigt Vorschlag
  → Benutzer verfeinert, verwirft oder wendet an
  → erst bei Apply ändern Chrome-APIs Tabs und Gruppen
```

### Hintergrundprofil

```text
Alarm/Browserstart
  → HTTP(S)-Tabs ermitteln
  → Cache und Fingerprints prüfen
  → Stage-1-Metadaten extrahieren
  → Profile in Batches erzeugen
  → SQLite-Cache aktualisieren
```

### Gespeichertes Set

```text
Chrome-Gruppe
  → Tab-Metadaten und Cache-Zusammenfassungen sammeln
  → Set und Tabs transaktional in SQLite speichern
  → Browser-Tabs schließen
  → später URLs öffnen und neue Chrome-Gruppe erzeugen
```

## Konfiguration

| Variable | Standard | Zweck |
|---|---|---|
| `TAB_ORGA_HOST` | `127.0.0.1` | Bind-Adresse des Servers |
| `TAB_ORGA_PORT` | `7777` | HTTP-Port |
| `TAB_ORGA_DATA_DIR` | `apps/server/data` | Verzeichnis der SQLite-Daten |
| `TAB_ORGA_AUTH_FILE` | automatisch gesucht | Pfad zur Pi/Codex-Authentifizierungsdatei |
| `TAB_ORGA_EXTENSION_ID` | nicht gesetzt | erwartete Extension-ID und feste CORS-Origin |
| `TAB_ORGA_ORGANIZE_TIMEOUT_MS` | `180000` | Timeout eines KI-Organize-Aufrufs |
| `TAB_ORGA_DEBUG` | nicht aktiv | mit `1` zusätzliche Debug-Ausgaben aktivieren |
| `TAB_ORGA_ORGANIZE_LOG_FILE` | `/tmp/tab-orga-organize.log` | Debug-Logdatei für Organize |

Im Docker-Setup werden Host, Datenverzeichnis und Auth-Datei in `compose.yaml` gesetzt. Der Server
verwendet Host Networking, bleibt aber an `127.0.0.1` gebunden.

## Technologien

| Bereich | Technologie |
|---|---|
| Side Panel | React 19, Vite, Tailwind CSS 4, dnd-kit |
| Browser | Chromium Manifest V3 |
| Server | Hono, TypeScript, Zod |
| Daten | SQLite, Drizzle |
| KI | Pi Agent mit OpenAI-Codex-Provider |
| Qualität | Vitest, Biome, Lefthook, Gitleaks |

