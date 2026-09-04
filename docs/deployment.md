# Lokales Deployment

Diese Anleitung beschreibt das vollständige Deployment von Tab Pilot auf dem lokalen Rechner:

- Der Hono-Server läuft als Docker-Compose-Service auf `127.0.0.1:7777`.
- Die Chrome-Erweiterung wird als signierte CRX-Datei gebaut.
- Chromium installiert und aktualisiert die Erweiterung über eine lokale Managed Policy.
- OAuth-Zugangsdaten und Anwendungsdaten bleiben bei neuen Builds erhalten.

## Voraussetzungen

- Node.js ab Version 22.19
- pnpm ab Version 11
- Docker mit Compose
- Chromium
- Ein bestehender Codex-Login in `apps/server/auth.json`
- Der bestehende private CRX-Schlüssel in `apps/extension/.local/tab-pilot.pem`

Den PEM-Schlüssel niemals ersetzen oder löschen. Ein neuer Schlüssel erzeugt eine neue Extension-ID
und Chromium behandelt die Erweiterung anschließend als ein anderes Produkt.

Falls noch kein Codex-Login vorhanden ist:

```bash
pnpm pi:login
```

## Vollständiges Deployment

Alle Befehle werden im Repository-Stammverzeichnis ausgeführt.

### 1. Abhängigkeiten und Produktions-Build

```bash
pnpm install --frozen-lockfile
pnpm build
```

Der Build erstellt sowohl den Server als auch die Chromium-Erweiterung.

### 2. Server bauen und starten

```bash
docker compose up -d --build
```

Status und Logs prüfen:

```bash
docker compose ps
docker compose logs --tail=50 tab-pilot-server
```

API und Codex-Verbindung prüfen:

```bash
curl http://127.0.0.1:7777/api/health
curl http://127.0.0.1:7777/api/ai/runtime
```

Die Health-Antwort sollte `"codex": true` enthalten. Der Runtime-Endpunkt sollte diese Rollen
melden:

- Lead: `gpt-5.6-sol`, Reasoning `high`
- Delegates: `gpt-5.6-terra` oder `gpt-5.6-sol`, maximal drei Aufrufe
- Tab-Profile: `gpt-5.6-terra`, Reasoning `medium`

Falls `codex` den Wert `false` hat:

```bash
pnpm pi:login
docker compose restart tab-pilot-server
```

### 3. Extension-Version erhöhen

Chromium installiert eine neue CRX nur, wenn deren Version höher als die installierte Version ist.
Deshalb vor einem Frontend-Deployment das Feld `version` in
`apps/extension/manifest.json` erhöhen, beispielsweise von `0.1.1` auf `0.1.2`.

Die vierteilige Chrome-Version muss aus Zahlen zwischen 0 und 65535 bestehen. Für dieses Projekt
reicht normalerweise ein Patch-Bump:

```text
0.1.1 -> 0.1.2
```

### 4. Extension erneut bauen und signieren

```bash
pnpm build:extension
pnpm crx:pack
```

Der Pack-Schritt aktualisiert diese ignorierten lokalen Artefakte:

- `apps/extension/.local/tab-pilot.crx`
- `apps/extension/.local/updates.xml`
- `apps/extension/.local/chromium-managed-policy.json`
- `apps/extension/.local/chromium-external-extension.json`

Die Extension-ID muss unverändert bleiben. Aktuell lautet sie:

```text
mmoakhhojfphiddbipfdkkjhmjfnodpn
```

### 5. Managed Policy installieren

Bei der ersten Installation oder nach einer Änderung des Policy-Pfads:

```bash
pnpm crx:install
```

Falls der Befehl wegen fehlender Schreibrechte unter `/etc/chromium` scheitert, den ausgegebenen
`sudo install`-Befehl ausführen. Der übliche Befehl lautet:

```bash
sudo install -Dm644 \
  apps/extension/.local/chromium-managed-policy.json \
  /etc/chromium/policies/managed/tab-pilot.json
```

Wenn die Policy bereits auf dieselbe `updates.xml` verweist, muss sie bei normalen
Extension-Updates nicht erneut installiert werden.

Die Dateien lassen sich vergleichen mit:

```bash
cmp -s \
  apps/extension/.local/chromium-managed-policy.json \
  /etc/chromium/policies/managed/tab-pilot.json \
  && echo "Policy ist aktuell"
```

### 6. Chromium aktualisieren

Chromium vollständig neu starten. Offene Sitzungen lassen sich mit `--restore-last-session`
wiederherstellen. Falls das lokale Update nicht sofort erkannt wird, Chromium einmal mit einem
kurzen Update-Intervall starten:

```bash
chromium \
  --user-data-dir="$HOME/.config/chromium/" \
  --profile-directory=chromiumprivate \
  --restore-last-session \
  --check-for-update-interval=1
```

Unter `chrome://policy` muss `ExtensionSettings` sichtbar sein. Unter `chrome://extensions` muss
Tab Organizer die neue Manifest-Version anzeigen.

## Nur den Server aktualisieren

Wenn sich ausschließlich Server-Code geändert hat:

```bash
pnpm build:server
docker compose up -d --build
curl http://127.0.0.1:7777/api/health
```

Ein neuer CRX-Build oder Chromium-Neustart ist dann nicht notwendig.

## Nur die Erweiterung aktualisieren

Wenn sich ausschließlich Extension-Code geändert hat:

1. Version in `apps/extension/manifest.json` erhöhen.
2. Extension bauen und packen.
3. Chromium neu starten und Version prüfen.

```bash
pnpm build:extension
pnpm crx:pack
```

Der Docker-Server muss dafür nicht neu gebaut werden.

## Persistente Daten

Docker Compose bindet diese Pfade ein:

```text
apps/server/auth.json -> /app/apps/server/auth.json
apps/server/data      -> /data
```

Dadurch bleiben Codex OAuth-Zugangsdaten, Einstellungen, Regeln, Memories und gecachte
Tab-Profile bei Image-Rebuilds erhalten.

## Fehlerbehebung

### Server nicht erreichbar

```bash
docker compose ps
docker compose logs --tail=100 tab-pilot-server
```

### Port 7777 ist belegt

Prüfen, welcher Prozess den Port verwendet:

```bash
ss -ltnp | rg ':7777'
```

### Extension bleibt auf der alten Version

Prüfen:

1. Wurde die Version in `manifest.json` erhöht?
2. Wurde `pnpm build:extension` nach dem Versions-Bump ausgeführt?
3. Zeigt `apps/extension/.local/updates.xml` auf die neue Version?
4. Ist die Managed Policy unter `/etc/chromium/policies/managed/tab-pilot.json` aktuell?
5. Wurde Chromium vollständig neu gestartet?

### Extension-ID hat sich geändert

In diesem Fall wurde wahrscheinlich ein anderer PEM-Schlüssel verwendet. Den ursprünglichen
Schlüssel `apps/extension/.local/tab-pilot.pem` wiederherstellen und erneut packen.

## Empfohlene Abschlussprüfung

```bash
pnpm test
pnpm lint
pnpm build
pnpm smoke:server
pnpm audit --prod
curl http://127.0.0.1:7777/api/health
curl http://127.0.0.1:7777/api/ai/runtime
```
