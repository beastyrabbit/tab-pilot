# HTTP-API

## Grundlagen

Der lokale Server hört standardmäßig auf `http://127.0.0.1:7777`. Alle Routen liegen unter
`/api`. Request- und Response-Daten sind JSON, außer dem Server-Sent-Events-Kanal des internen
Content-Bridge.

Beispiel:

```bash
curl http://127.0.0.1:7777/api/health
```

Fehlerhafte JSON-Payloads werden mit einem 4xx-Status und Validierungsinformationen abgewiesen.
Interne oder KI-bezogene Fehler liefern üblicherweise eine JSON-Antwort mit `error` und einem
5xx-Status. Der Server ist eine lokale Anwendungs-API und nicht als öffentlich erreichbarer
Mehrbenutzerdienst entworfen.

## Status und KI-Laufzeit

| Methode | Pfad | Zweck |
|---|---|---|
| `GET` | `/api/health` | Serverversion, Status und Codex-Verfügbarkeit |
| `GET` | `/api/ai/runtime` | reale Lead-, Delegate- und Profilmodelle sowie Auth-Status |

```bash
curl http://127.0.0.1:7777/api/ai/runtime
```

Die Runtime-Antwort ist absichtlich nur lesbar. Ein Client kann das Modell nicht durch das Senden
eines beliebigen Modellnamens umstellen.

## Organisieren

| Methode | Pfad | Zweck |
|---|---|---|
| `POST` | `/api/organize/runs` | asynchronen Lauf starten; Antwort `202` |
| `GET` | `/api/organize/runs/active?windowId=…` | aktiven Lauf eines Fensters finden |
| `GET` | `/api/organize/runs/:id` | Status oder Ergebnis abholen |
| `POST` | `/api/organize` | synchron organisieren |
| `POST` | `/api/organize/refine` | vorhandenen Vorschlag mit Feedback verfeinern |

Ein Organize-Request enthält die Tabs des aktuellen Fensters einschließlich ihrer `windowId` und
`groupId`. Er kann vorhandene Gruppen und eine einmalige Anweisung enthalten. Wichtige Grenzen:

- höchstens 500 Tabs,
- höchstens 200 vorhandene Gruppen,
- Anweisung höchstens 2.000 Zeichen.

Vereinfachtes Beispiel:

```bash
curl -X POST http://127.0.0.1:7777/api/organize/runs \
  -H 'Content-Type: application/json' \
  -d '{
    "tabs": [
      {
        "id": 11,
        "windowId": 1,
        "groupId": -1,
        "title": "Hono documentation",
        "url": "https://hono.dev/"
      },
      {
        "id": 12,
        "windowId": 1,
        "groupId": -1,
        "title": "TypeScript",
        "url": "https://www.typescriptlang.org/"
      }
    ],
    "existingGroups": [],
    "instruction": "Developer documentation together"
  }'
```

Der asynchrone Status wechselt von einem laufenden Zustand zu einem abgeschlossenen Ergebnis oder
einem Fehler. Läufe sind nicht persistent und überleben keinen Serverneustart.

## Einstellungen

| Methode | Pfad | Zweck |
|---|---|---|
| `GET` | `/api/settings` | Einstellungen lesen |
| `PUT` | `/api/settings` | Einstellungen ändern |

Persistiert werden `generalPrompt` mit höchstens 2.000 Zeichen und `groupTitleLength` mit einem der
Werte `short`, `medium` oder `long`.

```bash
curl -X PUT http://127.0.0.1:7777/api/settings \
  -H 'Content-Type: application/json' \
  -d '{"generalPrompt":"Homelab ist eine eigene Gruppe","groupTitleLength":"medium"}'
```

## Regeln

| Methode | Pfad | Zweck |
|---|---|---|
| `GET` | `/api/rules` | alle Regeln lesen |
| `POST` | `/api/rules` | Regel erstellen |
| `PUT` | `/api/rules/:id` | Regel aktualisieren |
| `DELETE` | `/api/rules/:id` | Regel löschen |

Eine Regel besitzt `pattern`, `matchType`, `targetGroup`, optional `color` und einen Aktivstatus.
`matchType` ist `url-contains`, `domain`, `title-contains` oder `regex`. Das Muster darf höchstens
2.000 Zeichen, der Gruppenname höchstens 100 Zeichen enthalten. Der zuerst passende aktive Eintrag
wird bei der Gruppierung deterministisch erzwungen.

Da der aktuelle Side-Panel-Build noch keinen Einstieg zum vorhandenen Regel-Editor bietet, ist
diese API momentan der direkte Verwaltungsweg. Beispiel:

```bash
curl -X POST http://127.0.0.1:7777/api/rules \
  -H 'Content-Type: application/json' \
  -d '{
    "pattern":"github.com",
    "matchType":"domain",
    "targetGroup":"Development",
    "color":"blue",
    "enabled":true
  }'
```

## Memories

| Methode | Pfad | Zweck |
|---|---|---|
| `GET` | `/api/memory` | alle Memories lesen |
| `POST` | `/api/memory` | Memory erstellen |
| `PUT` | `/api/memory/:id` | Memory ändern |
| `DELETE` | `/api/memory/:id` | einzelnen Eintrag löschen |
| `DELETE` | `/api/memory` | alle Einträge löschen |
| `POST` | `/api/memory/ai-edit` | Memories per natürlicher Anweisung bearbeiten |

Eine Observation ist auf 2.000 Zeichen begrenzt. AI Edit verwendet den authentifizierten
Codex-Provider; CRUD-Operationen selbst benötigen keinen KI-Aufruf.

## Gespeicherte Sets

| Methode | Pfad | Zweck |
|---|---|---|
| `GET` | `/api/stored-sets` | Set-Übersicht lesen |
| `POST` | `/api/stored-sets` | Set mit Tabs anlegen |
| `GET` | `/api/stored-sets/:id` | Set und Tabs lesen |
| `GET` | `/api/stored-sets/:id/restore` | Wiederherstellungs-Payload lesen |
| `POST` | `/api/stored-sets/:id/tabs` | weitere Tabs anhängen |
| `DELETE` | `/api/stored-sets/:id` | Set einschließlich Tabs löschen |

Ein Request darf höchstens 1.000 Tabs enthalten. Doppelte normalisierte URLs werden innerhalb
eines Sets nicht mehrfach gespeichert. Der Restore-Endpunkt öffnet keine Tabs selbst; er liefert
die geordneten Daten an die Erweiterung, die anschließend die Chrome-APIs verwendet.

## Profil- und Zusammenfassungs-Cache

| Methode | Pfad | Zweck |
|---|---|---|
| `POST` | `/api/summarize/check` | Cache-Status und Stage-1-Sperren für URLs prüfen |
| `POST` | `/api/summarize/lookup` | gecachte Zusammenfassungen für die Suche lesen |
| `POST` | `/api/summarize/stage1` | Metadatenprofile erstellen und cachen |
| `POST` | `/api/summarize/failures` | fehlgeschlagene Stage-1-URLs mit Cooldown markieren |
| `POST` | `/api/summarize` | Screenshotprofile erstellen und als Stage 2 cachen |

Check und Lookup akzeptieren bis zu 500 URLs. Stage 1 verarbeitet maximal zehn Tabs pro Request.
Der Screenshot-Endpunkt akzeptiert maximal zehn Bilder pro Request; der Service Worker nutzt
kleinere Batches von vier. Ein Bild ist auf fünf Millionen Zeichen in der Request-Repräsentation
begrenzt.

## Interne Content-Bridge

| Methode | Pfad | Zweck |
|---|---|---|
| `GET` | `/api/content-bridge/token` | flüchtiges Bridge-Token erhalten |
| `GET` | `/api/content-bridge/events` | Inhaltsanfragen als SSE empfangen |
| `POST` | `/api/content-bridge/request` | intern auf Seiteninhalt warten |
| `POST` | `/api/content-bridge/results` | Extraktionsergebnisse zurückgeben |

Diese Routen verbinden einen laufenden Server-Agenten mit der Erweiterung. Mutierende Aufrufe
erfordern `X-Bridge-Token`. Das Token wird beim Serverstart zufällig erzeugt und ist nicht als
stabile Drittanbieter-Schnittstelle gedacht. Ein Inhaltsergebnis ist auf 10.000 Zeichen begrenzt.

## Client-Debug

`POST /api/debug/client` nimmt kompakte Client-Diagnosen entgegen. Ohne
`TAB_ORGA_DEBUG=1` ist der Endpunkt effektiv ein No-op. Debug-Ausgaben können sensible Seitentitel
oder URLs enthalten und sollten nur zur lokalen Fehlersuche aktiviert werden.
