# Dokumentation

Tab Pilot ist eine lokale Chromium-Erweiterung zur KI-gestützten Organisation offener Tabs. In
Chromium erscheint sie derzeit unter dem Namen **Tab Organizer**. Die Erweiterung zeigt eine
Vorschau, bevor sie Gruppen verändert; ein lokaler Server übernimmt KI-Aufrufe, Regeln,
Einstellungen und persistente Daten.

## Für Anwender

- [Anwendung und Bedienung](anwendung.md): Oberfläche, Organisieren, Verfeinern, Suche, gespeicherte
  Sets und bekannte Einschränkungen
- [KI und Tab-Analyse](ai-und-tab-analyse.md): welche Informationen analysiert werden, wann
  Screenshots entstehen und wie Gruppenvorschläge gebildet werden
- [Deployment](deployment.md): Server und signierte Chromium-Erweiterung installieren oder
  aktualisieren

## Für Entwicklung und Betrieb

- [Architektur](architektur.md): Komponenten, Kontrollflüsse, Zuständigkeiten und Konfiguration
- [HTTP-API](api.md): öffentliche und interne Endpunkte des lokalen Servers
- [Daten und Sicherheit](daten-und-sicherheit.md): SQLite, OAuth-Datei, Cache, Datenschutz, Backup und
  Sicherheitsgrenzen
- [Entwicklung](entwicklung.md): lokales Arbeiten, Builds, Tests und typische Änderungsabläufe

## Ergänzende Betriebsanleitungen

- [Lokales Produktions-Setup](local-production.md): ältere, ausführliche englische Anleitung
- [Docker-Server](docker-server.md): Docker-spezifische Details
- [Chromium-CRX](chromium-crx.md): signierte CRX und Managed Policy im Detail

## Schnellstart

```bash
pnpm install --frozen-lockfile
pnpm pi:login
pnpm build
docker compose up -d --build
curl http://127.0.0.1:7777/api/health
```

Danach die Erweiterung bauen und installieren:

```bash
pnpm crx:pack
pnpm crx:install
```

Der vollständige Ablauf, einschließlich Versions-Bump und Chromium-Neustart, steht in der
[Deployment-Anleitung](deployment.md).

