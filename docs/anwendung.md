# Anwendung und Bedienung

## Zweck

Tab Pilot organisiert die Tabs des aktuellen Chromium-Fensters in nachvollziehbare Gruppen. Die
KI ändert den Browser nicht direkt: Sie erstellt zuerst einen Vorschlag. Erst **Apply** setzt diesen
Vorschlag über die Chrome-APIs um.

Die Anwendung besteht aus:

- dem Side Panel als Benutzeroberfläche,
- einem Manifest-V3-Service-Worker für Browserzugriffe und Hintergrundanalyse,
- einem lokalen Server auf `127.0.0.1:7777` für KI, Regeln und persistente Daten.

## Hauptansicht

Die Kopfzeile enthält:

- **Organize**: analysiert die Tabs des aktuellen Fensters und öffnet die Vorschau,
- **Ungroup all**: entfernt nach einer zweiten Bestätigung innerhalb von drei Sekunden alle Gruppen
  des aktuellen Fensters,
- eine Statusanzeige für den lokalen Server,
- eine Kennzeichnung, wenn der Testmodus aktiv ist,
- Zugänge zu Memories, gespeicherten Sets und Einstellungen.

Unterhalb der Kopfzeile kann eine einmalige Anweisung eingegeben werden, zum Beispiel:

```text
Fasse alle Tabs zum Homelab zusammen, aber lasse E-Mail ungruppiert.
```

Diese Anweisung gilt nur für den aktuellen Lauf. Dauerhafte Präferenzen gehören in die
Einstellungen oder in Memories.

## Tabs manuell verwalten

Die Liste zeigt vorhandene Chrome-Gruppen und ungruppierte Tabs. Folgende Aktionen sind ohne KI
möglich:

- nach Titel, URL, Seiteninhalt oder gecachter Zusammenfassung suchen,
- Tabs per Drag-and-drop in eine andere Gruppe oder in den ungruppierten Bereich verschieben,
- eine Zielgruppe über das Verschieben-Menü wählen,
- Gruppen umbenennen,
- eine einzelne Gruppe auflösen,
- eine Gruppe als gespeichertes Set ablegen.

Nach Gruppenänderungen werden Gruppen nach links sortiert und eingeklappt. Kleine zeitliche
Abstände zwischen Browseraktionen vermeiden Darstellungsfehler in Chromium unter Linux.

## Organisieren und Vorschlag prüfen

1. Optional eine einmalige Anweisung eingeben.
2. **Organize** auswählen.
3. Warten, bis der asynchrone Lauf abgeschlossen ist. Das Side Panel kann sich nach einem erneuten
   Öffnen wieder mit dem laufenden Vorgang verbinden.
4. Den Vorschlag prüfen.
5. Optional Feedback eingeben und den Vorschlag verfeinern.
6. **Apply** auswählen oder mit **Cancel** verwerfen.

Die Vorschau zeigt pro Gruppe:

- Titel, Farbe und Anzahl der Tabs,
- ob eine vorhandene Gruppe weiterverwendet oder eine neue erstellt wird,
- Grundlage und Begründung der Gruppierung,
- unveränderte, verschobene und neu gruppierte Tabs,
- ausdrücklich ungruppiert gelassene Tabs mit Begründung.

Feedback kann allgemein, pro Gruppe oder pro Tab erfasst werden. Eine Verfeinerung ersetzt den
vorherigen Vorschlag, verändert aber weiterhin keine Browser-Tabs. Erkannte dauerhafte Präferenzen
können anschließend als Memory gespeichert werden.

### Testmodus

Der Testmodus erlaubt Analyse und Vorschau, deaktiviert aber **Apply**. Er ist sinnvoll, um neue
Anweisungen oder Änderungen der KI-Logik gefahrlos zu prüfen.

## Bedeutung der Analyseanzeige

Jeder Tab kann eine kleine Statusanzeige besitzen:

| Farbe | Bedeutung |
|---|---|
| Rot | Noch kein verwertbares Profil vorhanden |
| Gelb | Analyse läuft |
| Pink | Stage 1: Titel, URL und Metadaten wurden analysiert |
| Grün | Stage 2: zusätzliches Screenshot-Profil ist vorhanden |

Stage 1 läuft automatisch im Hintergrund. Stage 2 wird nur nach einer ausdrücklichen Aktion des
Benutzers gestartet. Details stehen unter [KI und Tab-Analyse](ai-und-tab-analyse.md).

## Suche

Die Suche prüft Titel und URL sofort. Nach Eingabe einer Suchanfrage extrahiert die Erweiterung für
noch nicht gelesene Tabs zusätzlich Metadaten und bereinigten Hauptinhalt. Gleichzeitig fragt sie
bereits gecachte KI-Zusammenfassungen beim lokalen Server ab. Die Extraktion läuft mit begrenzter
Parallelität, damit der Browser benutzbar bleibt.

Die Suche selbst verändert keine Tabs. Seiteninhalt wird nicht automatisch allein wegen der Suche
an das KI-Modell gesendet; er bleibt zunächst im Kontext der Erweiterung. Ein Organize-Lauf kann
gezielt Seitenbelege für mehrdeutige Tabs anfordern.

## Memories

Memories sind dauerhafte, harte Anweisungen für zukünftige Organisationsläufe, zum Beispiel:

```text
Tabs zu Kubernetes und Proxmox gehören in die Gruppe Homelab.
```

Im Memory-Manager können Einträge erstellt, geändert und gelöscht werden. **AI Edit** setzt eine
natürlichsprachliche Änderungsanweisung in konkrete Memory-Änderungen um. Beim Organisieren muss
das Modell jeden aktiven Memory-Eintrag entweder befolgen oder als nicht anwendbar kennzeichnen;
ein stilles Ignorieren ist nicht zulässig.

## Regeln

Regeln ordnen passende URLs deterministisch einer festen Gruppe zu und haben Vorrang vor der
freien KI-Gruppierung. Der Server bietet dafür eine vollständige CRUD-API, und die Regeln werden
bei jedem Organize-Lauf angewandt und serverseitig erzwungen.

Der Code enthält bereits einen `RuleEditor`, die derzeit ausgelieferte Side-Panel-Oberfläche hat
aber noch keinen Einstieg zu diesem Editor. Regeln lassen sich momentan über die
[HTTP-API](api.md#regeln) verwalten. Die frühere README-Aussage, Regeln könnten direkt in der UI
angelegt werden, ist daher nicht der aktuelle Produktstand.

## Gespeicherte Sets

Eine Gruppe kann als Set gespeichert werden. Dabei werden Name, Farbe, Reihenfolge, URLs, Titel und
vorhandene Zusammenfassungen in SQLite abgelegt; anschließend schließt die Anwendung die
zugehörigen Tabs.

In der Ansicht **Stored Sets** kann ein Set:

- angezeigt,
- wiederhergestellt,
- oder gelöscht werden.

Beim Wiederherstellen öffnet die Erweiterung gültige `http`- und `https`-URLs in gespeicherter
Reihenfolge und erzeugt daraus wieder eine Chrome-Gruppe. Ungültige oder nicht unterstützte URLs
werden übersprungen.

## Einstellungen

Persistente Anwendungseinstellungen sind:

- **Organization Preferences**: allgemeine Anweisungen für alle Läufe,
- **Group Title Length**: `short`, `medium` oder `long`.

Daneben zeigt die Oberfläche die tatsächlich serverseitig konfigurierten KI-Rollen und den
Authentifizierungsstatus nur lesend an. Der Modellselektor ist bewusst kein vorgetäuschter
Umschalter mehr; die Modelle werden zentral im Server festgelegt.

## Geltungsbereich

Manuelle Aktionen und **Organize** arbeiten mit dem aktuellen Browserfenster. Der Service-Worker
kann für die automatische Stage-1-Vorbereitung HTTP(S)-Tabs browserweit erfassen. Interne
Chromium-Seiten, Erweiterungsseiten und andere nicht unterstützte URLs werden nicht als normale
Webseiten analysiert oder aus gespeicherten Sets wiederhergestellt.

## Bekannte Einschränkungen

- Der Regel-Editor ist noch nicht über die ausgelieferte UI erreichbar.
- Ein laufender Organize-Vorgang lebt im Arbeitsspeicher des Servers. Ein Serverneustart beendet
  ihn; abgeschlossene Läufe werden nur kurzzeitig zur Abholung vorgehalten.
- Chromium kann Gruppenfarben unter Linux gelegentlich erst verspätet neu zeichnen, obwohl der
  Browserzustand bereits korrekt ist.
- Stage 2 benötigt sichtbare, aufrufbare Webseiten und kann auf geschützten oder internen Seiten
  keinen Screenshot erzeugen.
- Der lokale Server ist für genau einen lokalen Benutzer ausgelegt und besitzt keine
  Mehrbenutzerverwaltung.

