# KI und Tab-Analyse

## Grundprinzip

Tab Pilot verwendet keine einzelne freie Chat-Anfrage. Die Anwendung sammelt Belege in Stufen,
erstellt strukturierte Profile, übergibt diese an einen Lead-Lauf und akzeptiert ausschließlich
validierte Tool-Ausgaben. Browserinhalte gelten dabei als nicht vertrauenswürdige Daten und nicht
als Anweisungen.

Die Modellkonfiguration ist serverseitig festgelegt:

| Aufgabe | Modell | Reasoning |
|---|---|---|
| Gruppierung und Verfeinerung | `gpt-5.6-sol` | `high` |
| Bedarfsabhängige Delegates | `gpt-5.6-terra` oder `gpt-5.6-sol` | `high` |
| Stage-1- und Stage-2-Profile | `gpt-5.6-terra` | `medium` |

Der Provider ist `openai-codex`. Der Transport wird automatisch gewählt: WebSocket wird bevorzugt,
SSE dient als Rückfall. Der Server verwendet die Standard-Service-Tier und eine niedrige
Textausführlichkeit, weil die fachlichen Antworten als strukturierte Tool-Payloads erwartet werden.

Die tatsächlich laufende Konfiguration ist lesbar unter:

```bash
curl http://127.0.0.1:7777/api/ai/runtime
```

## Welche Daten stehen zur Verfügung?

Je nach Stufe und Bedarf können verwendet werden:

- Tab-ID, Titel und URL,
- vorhandene Chrome-Gruppe und deren Farbe,
- Description, Open-Graph-Metadaten, Keywords und Canonical URL,
- Überschriften und bereinigter Haupttext,
- ein komprimierter Screenshot,
- zuvor gecachte semantische Profile,
- aktive Regeln, Memories und allgemeine Einstellungen,
- Zusammenfassungen gespeicherter Sets,
- die einmalige Benutzeranweisung.

Nicht jeder Lauf verwendet alle Daten. Der normale Weg beginnt mit den günstigeren Stage-1-Daten;
Seiteninhalt, Screenshots und Delegates sind zusätzliche Evidenz.

## Stage 1: Metadatenprofil

Stage 1 läuft beim Installieren und Starten der Erweiterung sowie danach ungefähr alle 15 Minuten.
Ein Organize-Klick startet zusätzlich eine beschleunigte Runde und beendet einen möglicherweise
laufenden Stage-2-Job, damit die für den Vorschlag wichtigeren Profile Vorrang haben.

Für jeden unterstützten HTTP(S)-Tab werden Titel, URL und verfügbare Metadaten in ein strukturiertes
Profil überführt:

```text
summary         kurze Zusammenfassung
subjects[]      Themen und Gegenstände
activity        vermutete Tätigkeit oder Absicht
namedEntities[] konkrete Projekte, Produkte, Personen oder Organisationen
confidence      Konfidenz
needsMoreEvidence
```

Das Modell muss für jede angeforderte Tab-ID genau ein Profil oder einen ausdrücklichen Fehler
liefern. Unbekannte IDs, doppelte Ergebnisse und unvollständige Antworten werden abgewiesen.

## Stage 2: Screenshotprofil

Stage 2 ist optional und wird nur nach ausdrücklicher Freigabe in der Oberfläche gestartet. Die
Erweiterung nimmt sichtbare Webseiten mit begrenzter Parallelität auf, verkleinert sie auf maximal
1.600 Pixel Breite und begrenzt die Höhe standardmäßig auf 2.000 Pixel. Das JPEG-Qualitätsniveau
liegt bei 50. Die Bilder werden in kleinen Batches an den lokalen Server und von dort zur
Profilbildung an Codex gesendet.

Stage 2 ersetzt Stage 1 nicht, sondern ergänzt oder präzisiert das Profil. Es ist besonders bei
visuellen Anwendungen oder wenig aussagekräftigen Titeln nützlich, verursacht aber mehr
Verarbeitung und überträgt sichtbaren Seiteninhalt. Deshalb ist es kein automatischer Standardweg.

## Cache und Aktualität

Profile werden anhand einer normalisierten URL gespeichert. Ein SHA-256-Fingerprint aus Titel und
normalisierter URL verbindet das Profil mit der beobachteten Evidenz. Ändert sich der Titel, kann ein
altes Stage-1-Profil nicht stillschweigend als aktuell weiterverwendet werden.

- reguläre Cache-Lebensdauer: sieben Tage,
- nach einem Stage-1-Fehler: standardmäßig 30 Minuten Abkühlzeit,
- Stage 1 und Stage 2 besitzen getrennte Profile, Fingerprints und Zeitstempel.

Die Cache-Prüfung vermeidet wiederholte KI-Aufrufe für unveränderte Tabs.

## Bildung eines Gruppenvorschlags

Der Server lädt Tabs und vorhandene Gruppen zusammen mit:

- passenden, aktivierten Regeln,
- allgemeinen Einstellungen,
- Memories,
- gecachten Profilen,
- gespeicherten Set-Zusammenfassungen,
- der einmaligen Anweisung.

Diese Evidenz wird kompakt im TOON-Format in den Kontext geladen. Danach arbeitet der Lead mit
einem kleinen Satz streng typisierter Werkzeuge. Er darf gezielt zusätzlichen Seiteninhalt für bis
zu fünf mehrdeutige Tabs anfordern und Teilmengen an Spezialisten delegieren.

### Delegation

Delegates sind optional. Der Lead kann eine sinnvolle Teilmenge von 2 bis 60 Tabs untersuchen
lassen. Es gibt höchstens drei Delegate-Aufrufe, maximal drei davon gleichzeitig. Delegates sind
read-only, können nicht weiter delegieren und treffen keine endgültige Gruppenentscheidung. Die
Verantwortung für den finalen Vorschlag bleibt beim Lead.

### Gruppierungspriorität

Die Leitlinien sind:

1. Passende deterministische Regeln und die einmalige Benutzeranweisung haben Vorrang.
2. Projekt- oder Recherchegruppen benötigen normalerweise mindestens drei Tabs. Zwei reichen bei
   einem exakt erkennbaren gemeinsamen Projekt, Artefakt oder einer bereits bestehenden Gruppe.
3. Eine klare thematische Gruppe benötigt normalerweise mindestens zwei Tabs.
4. Eine reine Gemeinsamkeit der Website oder Domain ist erst ab drei Tabs ein Rückfall.
5. Unsichere Tabs bleiben ausdrücklich ungruppiert.
6. Gruppen wie `Misc`, `Other` oder künstliche Einzelgruppen sind nicht erlaubt.

Vorhandene Chrome-Gruppen sind ein starkes Signal und sollen bei fortbestehender Kohärenz erweitert
werden. Sie sind jedoch nicht gesperrt: klar falsch zugeordnete Tabs dürfen verschoben werden.

Memories sind harte, dauerhafte Direktiven. Jeder Memory-Eintrag muss im Ergebnis als befolgt oder
nicht anwendbar bilanziert werden. Regeln sind noch stärker: Der erste passende aktive Regelsatz
weist den Tab fest zu.

## Strukturierte Ausgabe und serverseitige Prüfung

Die KI reicht den Vorschlag über ein TypeBox-definiertes Tool ein. Der Server parst keine
Gruppierung aus Prosa. Vor der Rückgabe an die Erweiterung werden unter anderem geprüft und
normalisiert:

- jede Tab-ID kommt global höchstens einmal vor,
- nur IDs aus dem Request werden akzeptiert,
- Referenzen auf unbekannte Gruppen werden entfernt,
- Konfidenzwerte werden in den gültigen Bereich begrenzt,
- verlangte Titellängen werden durchgesetzt,
- regelgebundene Tabs werden unabhängig von der KI-Ausgabe der richtigen Gruppe zugewiesen,
- unberücksichtigte Tabs bleiben explizit ungruppiert.

Validierungs- und vorübergehende Transportfehler können innerhalb des Laufzeitlimits erneut
versucht werden. Das Standardlimit für einen Organize-Lauf beträgt 180 Sekunden, für die
Profilbildung 60 Sekunden.

## Verfeinerung

Beim Verfeinern erhält das Lead-Modell den aktuellen Vorschlag, das Feedback und die vorhandene
Evidenz. Feedback kann allgemein oder einzelnen Gruppen und Tabs zugeordnet sein. Das Ergebnis
durchläuft dieselbe strukturierte Validierung und Regelerzwingung wie der erste Vorschlag.

Wenn Feedback wie eine wiederverwendbare Präferenz wirkt, kann die Antwort Memory-Kandidaten
enthalten. Sie werden nicht automatisch dauerhaft gespeichert; die Oberfläche lässt den Benutzer
darüber entscheiden.

## Prompt-Injection und Datenvertrauen

Titel, URLs, Metadaten, Seiteninhalt, Screenshottext und gespeicherte Seitentexte werden im
Systemkontext ausdrücklich als untrusted evidence markiert. Text wie „ignoriere vorherige
Anweisungen“ innerhalb einer Webseite darf die Systemregeln nicht verändern. Nur Einstellungen,
aktive Regeln, Memories und die ausdrückliche Benutzeranweisung sind Steuerinformationen.

Technische Grenzen und Datenschutzfolgen stehen in [Daten und Sicherheit](daten-und-sicherheit.md).

