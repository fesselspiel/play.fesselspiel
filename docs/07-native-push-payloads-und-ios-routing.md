# Native Push Payloads und iOS-Routing

## Zweck

Native Pushnachrichten enthalten neben dem sichtbaren Text eine strukturierte Nutzlast. Die iOS-App kann dadurch beim Antippen einer Pushnachricht direkt in die passende Ansicht springen, ohne den Text der Nachricht interpretieren zu müssen.

## Payload-Felder

Jede native Pushnachricht aus `src/lib/native-push-notifications.ts` enthält:

- `aps.alert.title`: sichtbarer Titel der Pushnachricht.
- `aps.alert.body`: sichtbarer Text der Pushnachricht.
- `aps.sound`: Sounddatei fuer iOS.
- `type`: grobe Kategorie, zum Beispiel `activity`, `order`, `tracker`, `media`, `idea`, `play_ready`, `telegram` oder `test`.
- `target.screen`: Zielansicht fuer die App.
- `target.id`: optionale ID des Zieldatensatzes.
- `target.href`: Webroute als Fallback.
- `auditId`: ID des Protokolleintrags.
- `eventId`: ID eines Events, falls die Aktion zu einem Event gehoert.
- `threadId`: Telegram-Thread-ID, falls die Aktion aus einem Thread stammt.
- `imageUrl`: optionale Bild-URL aus den Aktionsdetails.
- `action`: technische Aktion aus dem Protokoll.
- `entityType` und `entityId`: Datenobjekt aus dem Protokoll.
- `href`: Webroute als einfacher Fallback fuer ältere App-Versionen.

## Zielansichten

Das Backend setzt `target.screen` nach Route, Entität und Aktion:

- `setup`: Einstellungen, Push-Konfiguration und Setup.
- `dashboard`: Startseite.
- `media`: Bilder.
- `toys`: Spielsachen und Bondage-System-Produkte.
- `positions`: Szenen.
- `ideas`: Ideensammlung.
- `orders`: Aufträge.
- `trackers`: Tracker und Sessions.
- `activities`: Spielplan.

Wenn keine bessere Zuordnung möglich ist, wird `dashboard` verwendet.

## Sounds

Die Pushnachrichten verwenden benannte iOS-Sounds. Die App muss diese Dateien im Bundle enthalten:

- `playplaner_chime.caf`: Standard.
- `playplaner_ping.caf`: Spielampel.
- `playplaner_spark.caf`: Likes und Favoriten.
- `playplaner_pulse.caf`: Spielplan, Events und Aufträge.
- `playplaner_alert.caf`: Fehler.

## Beispiel

```json
{
  "aps": {
    "alert": {
      "title": "Self-Bondage-Auftrag erteilt",
      "body": "Neuer Auftrag fuer den Zirkel"
    },
    "sound": "playplaner_pulse.caf"
  },
  "type": "order",
  "target": {
    "screen": "orders",
    "id": "clx...",
    "href": "/orders/clx..."
  },
  "auditId": "clx...",
  "eventId": null,
  "threadId": null,
  "imageUrl": null,
  "action": "self_bondage_order_created",
  "entityType": "selfBondageOrder",
  "entityId": "clx...",
  "href": "/orders/clx..."
}
```

## Betrieb

APNs-Zugangsdaten werden nicht als Umgebungsvariablen gepflegt. Administratoren speichern Team ID, Key ID, Bundle ID, Umgebung und Private Key pro Seite unter `Einstellungen -> Push`. Der Private Key bleibt verschlüsselt in der Datenbank und darf nicht ins Repository.
