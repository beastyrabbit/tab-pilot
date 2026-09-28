# Entwicklung

## Voraussetzungen

- Node.js ab 22.19
- pnpm ab 11
- Chromium ab Version 120
- für Produktionsbetrieb Docker mit Compose
- eine Codex-Anmeldung für KI-Funktionen

```bash
pnpm install --frozen-lockfile
pnpm pi:login
```

Der Login schreibt die lokale Server-Authentifizierung. Die Datei darf nicht committed oder in
Terminalausgaben kopiert werden.

## Lokaler Entwicklungsbetrieb

Die ausgelieferte Erweiterung verwendet fest den lokalen Server unter `127.0.0.1:7777`. Deshalb
wird der Server für einen Integrationstest mit Hot Reload direkt auf diesem Port gestartet:

```bash
pnpm dev:server
```

Ein benannter Portless-Endpunkt wäre erst sinnvoll, wenn die Server-URL der Erweiterung
konfigurierbar ist. Das ist im aktuellen Build noch nicht der Fall.

Die Erweiterung separat beobachten und neu bauen:

```bash
pnpm dev:extension
```

Vite erzeugt das Extension-Bundle unter `apps/extension/dist`. Manifest-V3-Erweiterungen laden
geänderten Service-Worker- oder Side-Panel-Code nicht wie eine normale Webseite vollständig per
Hot Module Replacement. Nach einem Build muss die entpackte Erweiterung unter
`chrome://extensions` neu geladen oder für den installierten CRX ein neues Paket gebaut werden.

## Produktions-Build

```bash
pnpm build
```

Gezielt nur eine Anwendung bauen:

```bash
pnpm build:server
pnpm build:extension
```

Den gebauten Server ohne vollständiges Deployment prüfen:

```bash
pnpm smoke:server
```

## Tests und statische Prüfungen

```bash
pnpm test
pnpm lint
pnpm build
pnpm smoke:server
```

Während der Entwicklung:

```bash
pnpm test:watch
```

Biome formatiert und korrigiert unterstützte Lint-Probleme:

```bash
pnpm lint:fix
pnpm format
```

Vor einem Push sollten mindestens die Tests und Qualitätsprüfungen für das geänderte Verhalten
laufen. Lefthook bindet Projektprüfungen in Git-Hooks ein; Gitleaks schützt zusätzlich vor
versehentlich eingecheckten Zugangsdaten.

## Typische Änderungsorte

| Änderung | Bereich |
|---|---|
| Side-Panel-Komponente oder Bedienfluss | `apps/extension/src/sidepanel/` |
| Browseraktion, Alarm oder Screenshot | `apps/extension/src/background/` |
| Extraktion aus einer Webseite | `apps/extension/src/content/` |
| Request-/Response-Typen | `packages/shared/` |
| HTTP-Validierung und Endpunkt | `apps/server/src/routes/` |
| KI-Prompt, Tools und Orchestrierung | `apps/server/src/services/codex.ts` und zugehörige Services |
| Modellrollen und Transport | `apps/server/src/services/ai-runtime.ts` |
| SQLite und Cache | `apps/server/src/services/storage.ts` |
| CRX-Erzeugung | `scripts/pack-extension-crx.mjs` |

Änderungen an gemeinsam verwendeten Payloads müssen in Shared Types, Servervalidierung und
Extension-Client gemeinsam nachvollzogen werden. Die Serverroute sollte untrusted Browserdaten
weiterhin streng validieren.

## Einen Analysefluss testen

1. Server starten und `/api/health` sowie `/api/ai/runtime` prüfen.
2. Eine kleine Menge klar unterscheidbarer Test-Tabs öffnen.
3. Testmodus in der Erweiterung aktivieren.
4. Stage-1-Anzeigen abwarten und **Organize** ausführen.
5. Vorschlag, ungruppierte Gründe und bestehende Gruppen prüfen.
6. Verfeinerung mit allgemeinem sowie tabbezogenem Feedback testen.
7. Erst danach den Testmodus deaktivieren und **Apply** mit einem separaten Fenster prüfen.

Für Stage-2-Änderungen zusätzlich kontrollieren, dass ohne ausdrücklichen Start kein Screenshot
aufgenommen wird und dass unzugängliche Tabs als Fehler gemeldet werden, ohne den gesamten Batch
abzubrechen.

## Änderungen an der KI

Die Modellanzeige in der UI stammt aus `GET /api/ai/runtime`; Modellnamen dürfen nicht separat im
Frontend gepflegt werden. Wird eine Modellrolle geändert, müssen Runtime-Konfiguration,
Authentifizierungsprüfung und Tests gemeinsam aktualisiert werden.

Promptänderungen sollten mindestens gegen diese Fälle geprüft werden:

- vorhandene, kohärente Gruppe wird beibehalten,
- offensichtlich falsch gruppierter Tab darf umziehen,
- erste passende Regel gewinnt und bleibt gesperrt,
- Memory ist befolgt oder ausdrücklich nicht anwendbar,
- zwei lose Tabs erzeugen keine künstliche Gruppe,
- drei Tabs derselben Site dürfen als Site-Fallback gruppiert werden,
- unsichere Tabs bleiben mit Begründung ungruppiert,
- Seiteninhalt mit Prompt-Injection-Text wird nur als Evidenz behandelt,
- jede Tab-ID erscheint global höchstens einmal.

## Datenbankänderungen

SQLite wird über den Storage-Layer initialisiert. Bei Schemaänderungen müssen bestehende lokale
Datenbanken berücksichtigt und Migrationen idempotent bleiben. Niemals Testläufe gegen die
persönliche Produktionsdatenbank erzwingen; für Tests ein temporäres `TAB_ORGA_DATA_DIR`
verwenden.

## Extension veröffentlichen

Für jede installierbare Extension-Änderung:

1. `version` in `apps/extension/manifest.json` erhöhen.
2. `pnpm build:extension` ausführen.
3. mit dem bestehenden privaten PEM-Schlüssel `pnpm crx:pack` ausführen.
4. Chromium neu starten und die installierte Version prüfen.

Der PEM-Schlüssel darf nicht ersetzt werden, sonst ändert sich die Extension-ID. Der vollständige
Ablauf steht in [Deployment](deployment.md).

## Server deployen

```bash
pnpm build:server
docker compose up -d --build
curl http://127.0.0.1:7777/api/health
curl http://127.0.0.1:7777/api/ai/runtime
```

Nur Serveränderungen erfordern keinen neuen CRX. Nur Extension-Änderungen erfordern keinen neuen
Server-Container, solange API und Shared Types kompatibel bleiben.
