# Mobile App Login und Event API

Diese Notiz ist die Uebergabe fuer Entwickler der nativen App. Ziel ist, Login, API-Token-Nutzung und push-faehige Ereignisse ohne WebView testen zu koennen.

## Native Anmeldung

Endpunkt:

```http
POST /api/external/auth/login
Content-Type: application/json
```

Body:

```json
{
  "identifier": "gabriel",
  "password": "passwort",
  "deviceName": "Gabriels iPhone"
}
```

Antwort:

```json
{
  "ok": true,
  "token": "fsp_...",
  "tokenType": "Bearer",
  "tokenLastSix": "abc123",
  "user": {
    "id": "user_id",
    "username": "gabriel",
    "email": "gabriel@example.com",
    "name": "Gabriel"
  },
  "tenant": {
    "id": "tenant_id",
    "slug": "playplaner",
    "name": "Playplaner",
    "domain": "playplaner.com"
  },
  "capabilities": []
}
```

Der Login erzeugt einen normalen API-Token fuer die aktuelle Seite. Die App soll diesen Token sicher speichern und danach alle `/api/external/*`-Aufrufe bevorzugt mit Header senden:

```http
Authorization: Bearer fsp_...
```

URL-Token (`?token=...`) bleibt fuer Alexa, Kurzbefehle und einfache Webhooks moeglich, sollte in nativen Apps aber nicht der Standard sein.

Fehler:

- `400 invalid_input`: Body fehlt oder ist ungueltig.
- `401 login_failed`: Benutzername/E-Mail oder Passwort falsch.
- `403 feature_disabled`: Externe API ist fuer die aktuelle Seite nicht aktiv.

## Web-Session Bridge fuer interne Browser

Wenn die App eine Portal-Seite in einem internen Browser oeffnet, besitzt sie zwar den API-Token, aber noch keinen Web-Session-Cookie. Dafuer gibt es einen kurzlebigen Bridge-Endpunkt:

```http
POST /api/external/auth/web-session
Authorization: Bearer fsp_...
Content-Type: application/json
```

Body:

```json
{
  "redirectTo": "/settings/push",
  "ttlSeconds": 120
}
```

Antwort:

```json
{
  "ok": true,
  "url": "https://playplaner.com/api/auth/web-session?token=...",
  "expiresAt": "2026-06-29T12:00:00.000Z",
  "ttlSeconds": 120
}
```

Die App oeffnet `url` im internen Browser. Der Server prueft den signierten Kurzzeit-Token, setzt den normalen `fesselspiel_session` Cookie und leitet auf `redirectTo` weiter. `redirectTo` darf nur ein relativer Pfad sein; externe URLs werden auf `/` reduziert.

## Admin View Context fuer Seiten- und Benutzersicht

Admins koennen in der nativen App eine andere Seite oder einen anderen Benutzer als Sichtkontext aktivieren. Der eigentliche Login bleibt der Admin-API-Token; der Server gibt einen kurzlebigen `contextId` zurueck, den die App bei allen folgenden externen Requests mitsendet.

```http
POST /api/external/admin/view-context
Authorization: Bearer fsp_...
Content-Type: application/json

{
  "mode": "tenant",
  "tenantId": "tenant_id",
  "ttlSeconds": 7200
}
```

```http
POST /api/external/admin/view-context
Authorization: Bearer fsp_...
Content-Type: application/json

{
  "mode": "user",
  "tenantId": "tenant_id",
  "userId": "user_id",
  "ttlSeconds": 7200
}
```

```http
POST /api/external/admin/view-context
Authorization: Bearer fsp_...
Content-Type: application/json

{ "mode": "clear" }
```

Antwort:

```json
{
  "ok": true,
  "contextId": "pvc_...",
  "expiresAt": "2026-07-10T18:00:00.000Z",
  "context": {
    "id": "pvc_...",
    "mode": "user",
    "expiresAt": "2026-07-10T18:00:00.000Z",
    "tenant": { "id": "tenant_id", "name": "Playplaner", "slug": "playplaner", "domain": "playplaner.com" },
    "user": { "id": "user_id", "displayName": "Anna", "username": "anna", "email": "anna@example.com", "role": "USER" }
  }
}
```

Folgeaufrufe:

```http
GET /api/external/status
Authorization: Bearer fsp_...
X-Playplaner-View-Context: pvc_...
```

Der Kontext ist an den API-Token gebunden und standardmaessig 2 Stunden gueltig. Maximal erlaubt sind 12 Stunden. `mode=tenant` ist Superadmins vorbehalten; `mode=user` setzt die Sicht auf den Benutzer innerhalb der angegebenen Seite. `mode=clear` loescht alle aktiven View-Contexts dieses API-Tokens.

## Event Feed fuer Push

Ereignisse basieren auf dem zentralen `AuditLog`. Alles, was im System sauber protokolliert wird, kann damit automatisch in der App sichtbar werden.

Endpunkt:

```http
GET /api/external/events
Authorization: Bearer fsp_...
```

Wichtige Query-Parameter:

- `limit`: 1 bis 200, Standard 50.
- `cursor`: Cursor aus `nextCursor` fuer die naechste Seite.
- `since`: ISO-Zeitstempel, z.B. `2026-06-26T12:00:00.000Z`.
- `action`: kann mehrfach gesetzt werden, z.B. `action=play_ready_changed&action=self_bondage_order_created`.
- `actions`: komma-separierte Alternative zu mehrfach `action`.
- `includeDelivery=1`: zeigt auch Versand-/Delivery-Ereignisse wie E-Mail/Telegram/External-Push-Logs.
- `includeDetails=0`: Details ausblenden, wenn die App nur Uebersicht braucht.

Beispiel:

```http
GET /api/external/events?limit=50&since=2026-06-26T12:00:00.000Z
Authorization: Bearer fsp_...
```

Antwort:

```json
{
  "ok": true,
  "nextCursor": "clx...",
  "count": 1,
  "items": [
    {
      "id": "clx_event_id",
      "action": "play_ready_changed",
      "actionLabel": "Spielampel geaendert",
      "title": "Gabriel ist voll Lust",
      "createdAt": "2026-06-26T12:15:00.000Z",
      "href": "/",
      "url": "https://playplaner.com/",
      "entity": {
        "type": "userSettings",
        "id": "user_id"
      },
      "actor": {
        "id": "user_id",
        "username": "gabriel",
        "displayName": "Gabriel",
        "imageUrl": "/api/files/..."
      },
      "notification": {
        "title": "Gabriel ist voll Lust",
        "body": "Gabriel · Spielampel geaendert",
        "url": "https://playplaner.com/",
        "deepLink": "/"
      },
      "engagement": {
        "likes": [],
        "comments": []
      },
      "details": {}
    }
  ]
}
```

`notification.title`, `notification.body` und `notification.deepLink` sind fuer native Push-Benachrichtigungen gedacht. Wenn fuer die Aktion eine Feed-Regel konfiguriert ist, werden deren Templates verwendet; sonst gelten die Standard-Templates.

### Event-Likes

Feed-/Protokolleintraege liefern im Eventfeed zusätzlich `canLike`, `likedByMe`, `likeCount` und pro Like ein `own`-Flag. Sichtbare Eintraege koennen nativ geliked und wieder entliked werden:

```http
POST /api/external/events/{eventId}/like
Authorization: Bearer fsp_...
```

```http
DELETE /api/external/events/{eventId}/like
Authorization: Bearer fsp_...
```

Antwort:

```json
{
  "ok": true,
  "eventId": "audit_log_id",
  "likedByMe": true,
  "likeCount": 1,
  "canLike": true,
  "likes": [
    {
      "id": "like_id",
      "own": true,
      "createdAt": "2026-07-12T20:00:00.000Z",
      "user": { "id": "user_id", "displayName": "Gabriel" }
    }
  ]
}
```

Der Server prueft Tenant-/Zirkel-Sichtbarkeit ueber dieselbe Logik wie `GET /api/external/events`. Nicht sichtbare IDs liefern `404 event_not_found`.

### Entity-Likes

Direkte Dashboard-Feed-Zeilen ohne eigene Event-ID, z. B. Medien und Tracker-History-Items, koennen ueber einen Entity-Endpunkt geliked werden:

```http
POST /api/external/events/by-entity/{entityType}/{entityId}/like
DELETE /api/external/events/by-entity/{entityType}/{entityId}/like
Authorization: Bearer fsp_...
```

Unterstuetzte `entityType`-Werte:

- `media` fuer Bilder/Videos aus `GET /api/external/media`
- `tracker` oder `trackerEntry` fuer Eintraege aus `GET /api/external/trackers/history`

Antwort:

```json
{
  "ok": true,
  "eventId": "interner_like_anker",
  "entity": { "entityType": "media", "entityId": "media_id", "title": "Bildtitel", "href": "/media?item=media_id" },
  "likedByMe": true,
  "likeCount": 1,
  "canLike": true,
  "likes": []
}
```

`GET /api/external/media`, `GET /api/external/media/{id}`, `GET /api/external/trackers/history` und `GET /api/external/trackers/history/{id}` liefern dafuer ebenfalls `eventId`, `canLike`, `likedByMe`, `likeCount` und `likes[]`. Fuer jedes sichtbare Item mit `canLike:true` erzeugt der Server beim Lesen einen stabilen internen Like-Anker, sodass `eventId` nicht `null` ist und die App auch unberuehrte Items sofort ueber die normale Event-Like-Route oder ueber die Entity-Route liken kann. Dieser technische Anker wird aus `GET /api/external/events` ausgeblendet.

Kontingent-Erinnerungen (`tracker_quota_reminder`) sind interne Reminder und werden im normalen `GET /api/external/events` nicht ausgeliefert, damit der native Feed nicht mit wiederholten Todo-Hinweisen geflutet wird.

## Event Actions

Damit die App Filter, Push-Kategorien oder Debug-Ansichten nicht hart codieren muss, gibt es eine Aktionstypen-Liste.

```http
GET /api/external/events/actions
Authorization: Bearer fsp_...
```

Antwort:

```json
{
  "ok": true,
  "count": 2,
  "actions": [
    {
      "action": "play_ready_changed",
      "label": "Spielampel geaendert",
      "seenCount": 7
    }
  ]
}
```

## Native Push Test und Logs

Die native App kann Push-Geraete, Testversand und Versandprotokolle direkt ueber die externe API pruefen. Diese Endpunkte sind fuer die iPhone-/Android-Debug-Oberflaeche gedacht und liefern immer JSON.

### Geraete auflisten

```http
GET /api/external/push/devices
Authorization: Bearer fsp_...
```

Normale Benutzer sehen ihre eigenen registrierten Geraete. Admins sehen alle Geraete der aktiven Seite.

Antwort:

```json
{
  "ok": true,
  "count": 1,
  "items": [
    {
      "id": "device_id",
      "platform": "ios",
      "environment": "production",
      "deviceName": "Gabriels iPhone",
      "appVersion": "1.0.0",
      "lastSeenAt": "2026-07-11T12:00:00.000Z",
      "createdAt": "2026-07-11T11:00:00.000Z",
      "disabledAt": null,
      "user": {
        "id": "user_id",
        "displayName": "Gabriel"
      }
    }
  ],
  "devices": []
}
```

`devices` ist ein Alias von `items` fuer einfache App-Kompatibilitaet.

### Test-Push senden

```http
POST /api/external/push/test
Authorization: Bearer fsp_...
Content-Type: application/json

{
  "deviceId": "optional_device_id",
  "userId": "optional_user_id_admin_only",
  "circleId": "optional_circle_id_admin_only",
  "title": "Test",
  "body": "Push funktioniert",
  "sound": "default",
  "target": {
    "screen": "chat",
    "id": "circle_id",
    "href": "/chat",
    "entityType": "circle",
    "entityId": "circle_id"
  }
}
```

Ohne `deviceId`, `userId` oder `circleId` wird an die eigenen Geraete des API-Benutzers gesendet. Admins koennen gezielt ein Geraet, einen Benutzer oder einen Zirkel ansprechen.

Antwort:

```json
{
  "ok": true,
  "sent": 1,
  "failed": 0,
  "devices": 1,
  "attempts": [
    {
      "id": "delivery_id",
      "deviceId": "device_id",
      "environment": "production",
      "status": "SENT",
      "apnsId": "apns-id",
      "statusCode": 200,
      "errorReason": null
    }
  ]
}
```

Wenn APNs/FCM-Konfiguration fehlt oder kein Geraet vorhanden ist, bleibt die Antwort JSON und enthaelt `ok:false`, `error`, `sent`, `failed` und `attempts`.

### Push-Protokoll lesen

```http
GET /api/external/push/logs?limit=50&deviceId=optional_device_id
Authorization: Bearer fsp_...
```

Antwort:

```json
{
  "ok": true,
  "count": 1,
  "items": [
    {
      "id": "delivery_id",
      "createdAt": "2026-07-11T12:00:00.000Z",
      "type": "native_push_test",
      "action": "native_push_test",
      "actionLabel": "Native Push Test",
      "title": "Test",
      "body": "Push funktioniert",
      "target": { "screen": "chat", "id": "circle_id" },
      "device": {
        "id": "device_id",
        "platform": "ios",
        "environment": "production",
        "deviceName": "Gabriels iPhone",
        "appVersion": "1.0.0"
      },
      "environment": "production",
      "status": "SENT",
      "apnsId": "apns-id",
      "statusCode": 200,
      "errorReason": null
    }
  ],
  "logs": []
}
```

`logs` ist ein Alias von `items`.

## Session-Bilder, Kommentare und Relationen

Normale Spielplan-Sessions liegen unter `/api/external/sessions`. `POST /api/external/sessions` gibt eine `item.id`, `item.href` und `item.url` zurück, die direkt für Detail-, PATCH-, Bild- und Kommentaraufrufe verwendet werden können. Detail- und PATCH-Routen akzeptieren sowohl die interne ID als auch den lesbaren Slug.

```http
PATCH /api/external/sessions/{idOderSlug}
Authorization: Bearer fsp_...
Content-Type: application/json

{
  "title": "Abendplanung",
  "note": "Kurz vorbereiten",
  "status": "REQUESTED",
  "scheduledAt": "2026-07-10T18:00:00.000Z",
  "toyIds": ["toy_id"],
  "positionIds": ["position_id"],
  "bondageSystemItemIds": ["bondage_system_item_id"]
}
```

Die Antwort enthält die gespeicherten Relationen als `toys`, `positions` und `bondageSystemItems`.

```http
POST /api/external/sessions/{idOderSlug}/images
Authorization: Bearer fsp_...
Content-Type: multipart/form-data

file=<bilddatei>
title=Optionaler Titel
```

```http
DELETE /api/external/sessions/{idOderSlug}/images/{imageId}
Authorization: Bearer fsp_...
```

```http
POST /api/external/sessions/{idOderSlug}/comments
Authorization: Bearer fsp_...
Content-Type: application/json

{ "body": "Kommentar zur Session" }
```

```http
DELETE /api/external/sessions/{idOderSlug}/comments/{commentId}
Authorization: Bearer fsp_...
```

Session-Antworten enthalten zusätzlich:

- `images[]`: geschützte Session-Bilder mit `url/downloadUrl`.
- `comments[]`: Kommentare mit `own` und `canDelete`.
- `calendarMedia`, `calendar_media`, `linkedMedia`: Medien, die für den Session-Tag mit `showInCalendar=true` markiert wurden.
- `wikiPage`, `wiki_page`, `diaryEntry`, `wikiPageId`: derzeit `null`, reserviert für explizite Tagebuchrelationen.

## Kalender-Medien

Die normale Medien-API kann Bilder optional für den Kalender markieren. Ohne `showInCalendar` bleiben Bilder normale Galerie-Bilder.

```http
POST /api/external/media
Authorization: Bearer fsp_...
Content-Type: multipart/form-data

file=<bilddatei>
title=Kalenderbild
showInCalendar=true
calendarDate=2026-07-10T00:00:00.000Z
```

`GET /api/external/media` und `GET /api/external/media/{id}` liefern `showInCalendar` und `calendarDate`. `PATCH /api/external/media/{id}` kann beide Felder nachträglich ändern.

## Wiki-Audio-Transkription

Für Spracheingabe aus der App gibt es einen multipart-Endpunkt. Fehler kommen immer als JSON zurück, keine HTML-Fehlerseite.

Wiki-/Tagebuch-Listen liefern für Kalenderansichten stabile Datumsfelder:

```http
GET /api/external/wiki?limit=20
Authorization: Bearer fsp_...
```

Jeder Eintrag enthält `createdAt`, `updatedAt` und `calendarDate`. `calendarDate` entspricht bewusst dem Anlagedatum (`createdAt`), damit normales Bearbeiten von Titel oder Inhalt den ursprünglichen Kalendertag nicht verschiebt.

```http
POST /api/external/wiki/transcribe
Authorization: Bearer fsp_...
Content-Type: multipart/form-data

mode=create|append
pageId=<nur bei append>
title=<nur bei create optional>
visibility=PRIVATE|PARTNER|SHARED
insertAt=append|prepend
keepAudio=true|false
file=<audio/m4a oder audio/mp4>
```

Standard ist `keepAudio=false`; die Audiodatei wird dann nach erfolgreicher Transkription nicht gespeichert. Bei `keepAudio=true` wird sie als geschützter Wiki-Anhang abgelegt. Die Antwort enthält `ok`, `item`, `page`, `transcript` und optional `audioAttachment`.

## Bondage-System API

Bondage-System-Produkte können extern gelesen, geändert und synchronisiert werden. Die Änderung ist für Admins/Superadmins gedacht.

```http
PATCH /api/external/bondage-system/{idOderSlug}
Authorization: Bearer fsp_...
Content-Type: application/json

{
  "title": "Produktname",
  "description": "<p>Formatierte Beschreibung</p>",
  "active": true,
  "visibility": "PARTNER",
  "showExternalLink": true,
  "sortOrder": 20,
  "positionIds": ["position_id"]
}
```

```http
POST /api/external/bondage-system/sync
Authorization: Bearer fsp_...
```

```http
POST /api/external/bondage-system/{idOderSlug}/sync
Authorization: Bearer fsp_...
```

Die item-spezifische Sync-Route löst aktuell denselben seitenweiten Shopify-Sync aus und gibt Sync-Status und Produktanzahl zurück.

## Packlisten API

Packlisten sind ein eigenes Feature (`packingLists`) und werden ueber die externe API mit Bearer Token genutzt. Pack-Events sind der organisatorische Rahmen, Packlisten enthalten die konkreten Spielsachen.

```http
GET /api/external/packing/events
Authorization: Bearer fsp_...
```

```http
POST /api/external/packing/events
Authorization: Bearer fsp_...
Content-Type: application/json

{
  "title": "Studioabend",
  "eventId": "optional_event_id",
  "startsAt": "2026-07-10T18:00:00.000Z",
  "visibility": "PARTNER",
  "location": "Studio",
  "description": "Alles fuer den Abend vorbereiten"
}
```

```http
GET /api/external/packing/lists
Authorization: Bearer fsp_...
```

```http
POST /api/external/packing/lists
Authorization: Bearer fsp_...
Content-Type: application/json

{
  "title": "Studio-Tasche",
  "packingEventId": "optional_packing_event_id",
  "eventId": "optional_event_id",
  "visibility": "PARTNER",
  "note": "Ladegeraete nicht vergessen",
  "toyIds": ["toy_id_1", "toy_id_2"]
}
```

Weitere Endpunkte:

- `GET /api/external/packing/events/{id}`: einzelnes Pack-Event lesen.
- `PATCH /api/external/packing/events/{id}`: Pack-Event aendern.
- `DELETE /api/external/packing/events/{id}`: Pack-Event loeschen.
- `GET /api/external/packing/lists/{id}`: einzelne Packliste lesen.
- `PATCH /api/external/packing/lists/{id}`: Packliste aendern.
- `DELETE /api/external/packing/lists/{id}`: Packliste loeschen.
- `POST /api/external/packing/lists/{id}/items`: Spielzeug hinzufuegen. Body: `toyId`, `quantity?`, `note?`.
- `PATCH /api/external/packing/lists/{id}/items/{itemId}`: Packstatus setzen. Body: `packed: true|false`.

Antworten enthalten `progress`, `items`, `packingEvent`, `event`, `owner`, `visibility` und bei Spielzeugen die vorhandenen geschuetzten Bild-URLs.

## Zirkel-Chat

Der Chat ist ein geschuetzter Echtzeit-Chat fuer den aktiven Zirkel des API-Benutzers. Die App nutzt Bearer Token.

### Chat-Zirkel auflisten

```http
GET /api/external/chat/circles
Authorization: Bearer fsp_...
```

Antwortauszug:

```json
{
  "ok": true,
  "count": 2,
  "currentCircleId": "circle_id",
  "circles": [
    {
      "id": "circle_id",
      "name": "Maren & Gabriel",
      "current": true,
      "default": true,
      "memberCount": 2,
      "unreadCount": 1,
      "lastMessage": {
        "id": "message_id",
        "body": "Hallo",
        "createdAt": "2026-07-02T20:00:00.000Z",
        "hasFile": false,
        "fileKind": null,
        "sender": {
          "id": "user_id",
          "displayName": "Gabriel"
        }
      }
    }
  ]
}
```

Normale Benutzer sehen aktuell die Zirkel, in denen sie in der Seite Mitglied sind. Admins sehen alle Zirkel der Seite. Die Chat-Endpunkte akzeptieren `circleId` request-basiert, damit die App nicht global auf dem Server umschalten muss.

`currentCircleId` ist immer `null` oder eine ID aus `circles[]`. Wenn ein Admin-/View-Context aus einer anderen Seite eine alte Benutzer-Zirkel-ID mitbringt, nimmt der Server den ersten sichtbaren Zirkel dieser Seite als sicheren Fallback.

### Nachrichten lesen

```http
GET /api/external/chat/circle?limit=50&circleId=circle_id
Authorization: Bearer fsp_...
```

Antwortauszug:

```json
{
  "ok": true,
  "items": [
    {
      "id": "message_id",
      "body": "Hallo",
      "createdAt": "2026-07-02T20:00:00.000Z",
      "deleted": false,
      "own": true,
      "canDelete": true,
      "permissions": { "delete": true },
      "circle": {
        "id": "circle_id",
        "name": "Maren & Gabriel"
      },
      "sender": {
        "id": "user_id",
        "displayName": "Gabriel",
        "imageUrl": "/api/files/..."
      },
      "file": {
        "id": "file_id",
        "url": "/api/files/file_id",
        "downloadPath": "/api/files/file_id",
        "originalName": "bild.png",
        "mimeType": "image/png",
        "sizeBytes": 12345,
        "kind": "image"
      },
      "receipt": {
        "deliveredAt": "2026-07-02T20:00:00.000Z",
        "readAt": "2026-07-02T20:00:00.000Z"
      },
      "receipts": [
        {
          "userId": "user_id",
          "displayName": "Maren",
          "deliveredAt": "2026-07-02T20:00:00.000Z",
          "readAt": null
        }
      ],
      "readSummary": {
        "recipients": 1,
        "delivered": 1,
        "read": 0,
        "allDelivered": true,
        "allRead": false
      }
    }
  ]
}
```

`readSummary` ist fuer WhatsApp-artige Haken gedacht: eigene Nachricht gesendet, an Empfaenger geliefert, von Empfaengern gelesen. Bei mehreren Zirkelmitgliedern sind die Werte aggregiert.

### Session- und Anfragekarten im Chat

Wenn eine Chatnachricht automatisch aus einem Protokollereignis fuer einen Spieltermin bzw. eine Anfrage erzeugt wurde, reichert der Server das normale Chatobjekt zusaetzlich an. Die Felder erscheinen im Listen-Endpunkt, im SSE-Stream und bei neu gesendeten/erzeugten Nachrichten:

```json
{
  "id": "message_id",
  "body": "Spielplan angefragt: Studioabend",
  "entity": {
    "type": "session",
    "entityType": "session",
    "entityId": "session_id",
    "id": "session_id",
    "title": "Studioabend",
    "status": "REQUESTED",
    "plannedAt": "2026-07-12T18:00:00.000Z",
    "href": "/activities/studioabend",
    "owner": { "id": "user_id", "displayName": "Gabriel" }
  },
  "target": {
    "screen": "activities",
    "entityType": "session",
    "entityId": "session_id",
    "id": "session_id",
    "href": "/activities/studioabend"
  },
  "session": {
    "id": "session_id",
    "status": "REQUESTED",
    "permissions": {
      "canConfirm": true,
      "canReschedule": true,
      "canDecline": true,
      "canStart": false,
      "canCancel": true
    },
    "actions": ["CONFIRM", "RESCHEDULE", "DECLINE", "CANCEL"],
    "actionTargets": {
      "CONFIRM": { "method": "PATCH", "path": "/api/external/sessions/session_id", "body": { "status": "PLANNED" } },
      "DECLINE": { "method": "PATCH", "path": "/api/external/sessions/session_id", "body": { "status": "DISCARDED" } },
      "RESCHEDULE": { "method": "PATCH", "path": "/api/external/sessions/session_id", "body": { "plannedAt": "ISO_DATE_TIME", "status": "REQUESTED" } }
    },
    "statusActions": {
      "CONFIRM": "PLANNED",
      "DECLINE": "DISCARDED",
      "RESCHEDULE": "REQUESTED",
      "START": "DONE",
      "CANCEL": "DISCARDED"
    }
  },
  "permissions": {
    "delete": false,
    "canConfirm": true,
    "canReschedule": true,
    "canDecline": true,
    "canStart": false,
    "canCancel": true
  },
  "actions": ["CONFIRM", "RESCHEDULE", "DECLINE", "CANCEL"]
}
```

Die App soll Buttons nur aus `actions` bzw. den `can...`-Flags ableiten. Ausgefuehrt wird weiterhin ueber `PATCH /api/external/sessions/{id}`. Statuswerte sind `REQUESTED` fuer angefragt/Gegenvorschlag, `PLANNED` fuer bestaetigt, `DONE` fuer erledigt und `DISCARDED` fuer abgelehnt/verworfen.

### Echtzeit-Stream

```http
GET /api/external/chat/circle/stream?circleId=circle_id&after=2026-07-02T20:00:00.000Z
Authorization: Bearer fsp_...
Accept: text/event-stream
```

Alternativ kann der Token als Query-Parameter uebergeben werden:

```http
GET /api/external/chat/circle/stream?token=fsp_...&circleId=circle_id&after=2026-07-02T20:00:00.000Z
```

Der Stream sendet Server-Sent-Events. Beim Verbinden kommt:

```json
{ "ok": true, "type": "connected", "circle": { "id": "circle_id", "name": "Maren & Gabriel" } }
```

Neue Nachrichten kommen als:

```json
{
  "ok": true,
  "type": "messages",
  "circle": { "id": "circle_id", "name": "Maren & Gabriel" },
  "items": [
    {
      "id": "message_id",
      "body": "Hallo",
      "createdAt": "2026-07-02T20:00:00.000Z",
      "sender": { "id": "user_id", "displayName": "Gabriel" }
    }
  ]
}
```

Die App soll initial `GET /api/external/chat/circle` laden, danach den Stream mit `after=<createdAt der letzten Nachricht>` oeffnen und bei Verbindungsabbruch automatisch neu verbinden. Als Fallback kann alle 2-3 Sekunden der Listen-Endpunkt mit `after` abgefragt werden. Die Web-App macht genau diese Kombination.

Fuer die Datumsanzeige liefert jede Nachricht `createdAt` als ISO-Zeitpunkt. Die App bildet daraus Tagesgruppen wie in der Web-App:

- gleicher lokaler Tag wie heute: `Heute`
- lokaler Tag gestern: `Gestern`
- sonst formatiertes Datum, z. B. `Donnerstag, 02.07.2026`
- an der Nachricht selbst die lokale Uhrzeit, z. B. `22:00`

### Nachricht senden

```http
POST /api/external/chat/circle
Authorization: Bearer fsp_...
Content-Type: application/json

{ "circleId": "circle_id", "body": "Hallo" }
```

Alternativ multipart:

```http
POST /api/external/chat/circle
Authorization: Bearer fsp_...
Content-Type: multipart/form-data

circleId=circle_id
body=Hallo
file=@bild.png
```

Die Antwort liefert `item` und zur Abwaertskompatibilitaet auch `message`, beide mit demselben serialisierten Chat-Objekt.

### Als gelesen markieren

```http
POST /api/external/chat/circle/read
Authorization: Bearer fsp_...
Content-Type: application/json

{ "circleId": "circle_id", "upToMessageId": "message_id" }
```

Alternativen:

```json
{ "messageIds": ["message_1", "message_2"] }
{ "upToCreatedAt": "2026-07-02T20:00:00.000Z" }
```

### Nachricht loeschen

```http
DELETE /api/external/chat/circle/{messageId}
Authorization: Bearer fsp_...
```

`circleId` kann optional als Query-Parameter mitgegeben werden. Fuer das Loeschen validiert das Backend aber immer am tatsaechlichen Zirkel der Nachricht. Eigene Nachrichten koennen geloescht werden; Admins koennen alle Nachrichten in zugaenglichen Zirkeln loeschen. Es ist ein Soft-Delete. Neue GET-Responses liefern geloeschte Nachrichten nicht mehr aus. Das Event heisst `circle_chat_message_deleted_api`.

Chat-Events enthalten in `details` und in nativen Push-Payloads `circleId` und `circleName`. Fuer Push-Taps kann die App damit den richtigen Chat-Zirkel oeffnen.

## Katalog fuer native Apps

Spielsachen, Szenen und deren Kategorien sind ueber eigene externe Endpunkte abrufbar. Alle Endpunkte nutzen denselben API-Token wie der Eventfeed.

### Kategorien

```http
GET /api/external/catalog/categories?kind=all
Authorization: Bearer fsp_...
```

Parameter:

- `kind`: `all`, `toy` oder `position`.

Die Antwort enthaelt eine flache `categories`-Liste und `groups` nach `toy` und `position`.

Fuer native Spielzeug-Kategorieverwaltung gibt es zusaetzlich einfache Endpunkte:

```http
GET /api/external/catalog/toy-categories
POST /api/external/catalog/toy-categories
PATCH /api/external/catalog/toy-categories/{id}
Authorization: Bearer fsp_...
```

`GET` liefert `{ ok:true, items:[{ id, name, sortOrder }] }` und blendet den virtuellen Default `Allgemein` aus. `POST` erwartet JSON `{ "name": "Sensorik" }` und gibt `{ ok:true, item:{ id, name, sortOrder } }` zurueck. `PATCH` erwartet ebenfalls `{ "name": "..." }` und benennt die Kategorie um. Leere Namen werden mit `400 name_required` abgelehnt; doppelte Namen beim Umbenennen liefern `409 category_exists`.

Fuer Szenen gibt es die gleichen nativen Kategorie-Endpunkte:

```http
GET /api/external/catalog/position-categories
POST /api/external/catalog/position-categories
PATCH /api/external/catalog/position-categories/{id}
Authorization: Bearer fsp_...
```

Das Shape entspricht `toy-categories`, aber mit Feature-Gate `positions`.

### Spielsachen

```http
GET /api/external/catalog/toys?limit=100
GET /api/external/catalog/toys/{id}
POST /api/external/catalog/toys
PATCH /api/external/catalog/toys/{id}
Authorization: Bearer fsp_...
```

Parameter:

- `q`: Suche im Titel.
- `categoryId`: Filter auf eine Kategorie.
- `positionId`: Filter auf verknuepfte Szene.
- `includeRelations=0`: Verknuepfungen ausblenden.
- `token`: optional, erzeugt `downloadUrlWithToken` fuer Bildabrufe ohne Bearer-Header.

Jeder Eintrag enthaelt `category`, `image`, `favorites`, `isFavorite`, `positions` und `activities`.
Der Detail-Endpunkt akzeptiert die interne ID oder den Slug.

`POST /api/external/catalog/toys` legt eine neue Spielsache an und gibt `201` mit `ok:true,item:{...}` im gleichen Katalog-Shape zurueck. Minimaler JSON-Body:

```json
{
  "title": "Neue Spielsache",
  "description": "Optionale Beschreibung",
  "categoryId": "optional-vorhandene-kategorie",
  "category": "oder neue Kategorie",
  "positionIds": ["optionale-szenen-id"],
  "imageUrl": "optional-bestehende-geschuetzte-bild-url"
}
```

Fuer native Apps kann derselbe Endpunkt auch `multipart/form-data` verarbeiten. Pflichtfeld ist `title`; optional sind `description`, `categoryId`/`category`, `positionIds` und das Datei-Feld `file`. Die Datei wird geschuetzt gespeichert und im Rueckgabe-Shape als normales `image`-Objekt geliefert.

`PATCH /api/external/catalog/toys/{id}` aendert bestehende Spielsachen. Ohne Bild akzeptiert er JSON mit `title`, `description`, `categoryId` oder `category`. Mit Bild akzeptiert er `multipart/form-data` mit denselben Feldern und Datei-Feld `file`. Das Rueckgabe-Shape ist identisch zu `GET`.

### Tracker-Historie

```http
GET /api/external/trackers/history?from=YYYY-MM-DD&to=YYYY-MM-DD
GET /api/external/trackers/history?from=YYYY-MM-DD&to=YYYY-MM-DD&trackerKey=segufix
POST /api/external/trackers/history
Authorization: Bearer fsp_...
```

Der Endpunkt liefert echte Tracker-Eintraege fuer Kalenderansichten, keine Protokoll-, Reminder- oder Kontingent-Ereignisse. Die Antwort enthaelt `ok`, `items[]` und optional `nextCursor`. Jedes Item liefert kompatible Alias-Felder wie `trackerKey`/`key`, `trackerTitle`/`trackerName`, `startedAt`/`startTime`, `date`/`calendarDate`, `endedAt`/`endTime`, `durationMinutes`/`minutes` und `allDay`. Die Trackerfarbe wird flach als `colorHex`, `hexColor`, `trackerColor` und `color` sowie im Objekt `tracker.colorHex` geliefert.

Tracker-Eintraege liefern zusaetzlich `images[]`. Jedes Bild enthaelt `id`, `fileId`, `title`, `note`, `mimeType`, `sizeBytes`, `url`, `downloadUrl`, `downloadUrlWithToken`, `requiresAuthorization`, `createdAt` und `updatedAt`. Die Datei liegt geschuetzt hinter `/api/external/files/{fileId}` und muss mit Bearer Token geladen werden.

`POST /api/external/trackers/history` legt einen echten Tracker-Eintrag an und antwortet mit `201` und `{ ok:true, item }` im gleichen Shape wie die Detailroute. JSON-Body:

```json
{
  "trackerKey": "segufix",
  "title": "Optionaler Titel",
  "notes": "Begleitnotiz",
  "allDay": false,
  "date": "2026-07-13",
  "startTime": "2026-07-13T16:15",
  "durationMinutes": 45,
  "endTime": "2026-07-13T17:00",
  "fieldValues": {},
  "toyIds": [],
  "positionIds": [],
  "bondageSystemItemIds": []
}
```

Fuer nicht ganztägige Eintraege ist `startTime` Pflicht. `endTime` oder `durationMinutes` duerfen einzeln uebergeben werden; das Backend berechnet den jeweils konsistenten Wert. `durationMinutes` muss groesser/gleich 0 sein und `endTime` darf nicht vor `startTime` liegen. Fuer ganztägige Eintraege wird `allDay:true` plus `date` verwendet; Start-/Endzeiten werden dann nicht als Uhrzeit interpretiert.

Zeitstempel mit explizitem `Z` oder Offset, z. B. `2026-07-12T19:32:00.000Z` oder `2026-07-12T21:32:00+02:00`, werden als absolute Instants gespeichert. Zeitstempel ohne Offset, z. B. `2026-07-12T19:32`, werden als lokale Wandzeit der Plattform-Zeitzone `Europe/Berlin` interpretiert. Das gilt identisch fuer `POST /api/external/trackers/history` und `PATCH /api/external/trackers/history/{id}`.

Auch `GET /api/external/status` liefert fuer `openTrackers[]` und `recentTrackerEntries[]` dieselben Farbaliasse. `GET /api/external/trackers/quotas` liefert die Farbe unter `quota.tracker.colorHex` plus `color`, `hexColor` und `trackerColor`.

### Tracker-Livestream

```http
GET /api/external/trackers/stream
Authorization: Bearer fsp_...
Accept: text/event-stream
X-Playplaner-View-Context: optional
```

Der Stream liefert sofort ein Event `type:"snapshot"` und danach bei geaenderten Trackern `type:"tracker_updated"`. Dazwischen sendet er Keepalives. Payload:

```json
{
  "ok": true,
  "type": "snapshot",
  "status": {
    "ok": true,
    "generatedAt": "2026-07-13T12:00:00.000Z",
    "openTrackers": [],
    "recentTrackerEntries": [],
    "quotas": []
  },
  "openTrackers": [],
  "quotas": []
}
```

Die App kann bei Reconnect einfach erneut `GET /api/external/trackers/stream` oeffnen und parallel als Fallback `GET /api/external/status` oder `GET /api/external/trackers/history` verwenden.

Wenn `categoryId` fehlt oder ungueltig ist, wird `category`/`categoryName` verwendet oder die Standardkategorie `Allgemein` genutzt. `positionIds` werden nur verbunden, wenn das Szenen-Feature aktiv ist und die Szenen fuer den Benutzer sichtbar sind.

### Szenen

```http
GET /api/external/catalog/positions?limit=100
POST /api/external/catalog/positions
PATCH /api/external/catalog/positions/{id}
Authorization: Bearer fsp_...
```

`POST /api/external/catalog/positions` legt eine Szene an. Ohne Bild akzeptiert der Endpunkt JSON mit `title` oder `name`, optional `description`, `categoryId` oder `category`. Mit Bild akzeptiert er `multipart/form-data` mit denselben Feldern und Datei-Feld `file`. Das Rueckgabe-Shape entspricht `GET`/`PATCH`.

```http
GET /api/external/catalog/positions?limit=100
GET /api/external/catalog/positions/{id}
Authorization: Bearer fsp_...
```

Parameter:

- `q`: Suche im Namen.
- `categoryId`: Filter auf eine Kategorie.
- `toyId`: Filter auf verknuepftes Spielzeug.
- `selfBondage=1`: nur Self-Bondage-faehige Szenen.
- `includeRelations=0`: Verknuepfungen ausblenden.
- `token`: optional, erzeugt `downloadUrlWithToken` fuer Bildabrufe ohne Bearer-Header.

Jeder Eintrag enthaelt `category`, `image`, `favorites`, `isFavorite`, `selfBondageCapable`, `toys`, `bondageSystemItems` und `activities`.
Der Detail-Endpunkt akzeptiert die interne ID oder den Slug.

## Mobile Parity Endpunkte

Diese Endpunkte bilden die wichtigsten Portalbereiche nativ ab. Sie verwenden Bearer Auth und geben JSON zurueck.

### Spielplanung

- `GET /api/external/sessions?status=&cursor=&limit=`
- `GET /api/external/sessions/{id}`
- `POST /api/external/sessions`
- `PATCH /api/external/sessions/{id}`
- `DELETE /api/external/sessions/{id}`

`POST` akzeptiert `title`, `note`, `scheduledAt`/`plannedAt`, `status`, `toyIds[]`, `positionIds[]` und `bondageSystemItemIds[]`.

### Ideen

- `GET /api/external/ideas?status=&q=&cursor=&limit=`
- `GET /api/external/ideas/{id}`
- `POST /api/external/ideas`
- `PATCH /api/external/ideas/{id}`
- `DELETE /api/external/ideas/{id}`

`POST` akzeptiert `title`, `note`/`text`, `status`, `toyIds[]` und `positionIds[]`.

### Auftraege

- `GET /api/external/orders?status=&cursor=&limit=`
- `GET /api/external/orders/{id}`
- `POST /api/external/orders`
- `PATCH /api/external/orders/{id}`
- `POST /api/external/orders/{id}/status`

Der Status-Endpunkt akzeptiert `action=accept`, `action=complete` oder `action=cancel`.

### Bondage-System

- `GET /api/external/bondage-system?q=&cursor=&limit=`
- `GET /api/external/bondage-system/{id}`

`{id}` darf die interne ID oder der Slug des Shopify-Produkts sein.

## Sichtbarkeit

Der Eventfeed ist bewusst nicht global:

- Admins sehen Ereignisse der aktiven Seite.
- Normale Benutzer sehen Ereignisse aus ihrem sichtbaren Benutzer-/Zirkelbereich.
- Systemereignisse ohne Benutzerbezug werden aktuell nicht ausgeliefert, weil `AuditLog` noch kein eigenes `tenantId` besitzt.

## API-Control

Die Endpunkte sind in den Capabilities sichtbar und erscheinen damit auch unter `/settings/api-control`:

- `POST /api/external/auth/login`
- `POST /api/external/auth/web-session`
- `GET /api/external/points`
- `GET|POST /api/external/points/rules`
- `GET|POST /api/external/wiki`
- `GET|PATCH|DELETE /api/external/wiki/{id}`
- `GET /api/external/events`
- `POST|DELETE /api/external/events/{id}/like`
- `POST|DELETE /api/external/events/by-entity/{entityType}/{entityId}/like`
- `GET /api/external/events/actions`
- `GET|POST /api/external/calendar-events`
- `GET|PATCH|DELETE /api/external/calendar-events/{id}`
- `POST|DELETE /api/external/calendar-events/{id}/check-in`
- `GET /api/external/trackers/history`
- `GET|PATCH|DELETE /api/external/trackers/history/{id}`
- `GET|POST /api/external/trackers/history/{id}/images`
- `GET|PATCH|DELETE /api/external/trackers/history/{id}/images/{imageId}`
- `GET /api/external/trackers/quotas`
- `POST /api/external/share`
- `GET /api/external/catalog/categories`
- `GET|POST /api/external/catalog/toy-categories`
- `PATCH /api/external/catalog/toy-categories/{id}`
- `GET|POST /api/external/catalog/toys`
- `GET|PATCH|DELETE /api/external/catalog/toys/{id}`
- `POST|DELETE /api/external/catalog/toys/{id}/favorite`
- `POST /api/external/catalog/reorder`
- `GET|POST /api/external/catalog/positions`
- `GET|POST /api/external/catalog/position-categories`
- `PATCH /api/external/catalog/position-categories/{id}`
- `GET|PATCH|DELETE /api/external/catalog/positions/{id}`
- `POST|DELETE /api/external/catalog/positions/{id}/favorite`
- `GET|POST /api/external/sessions`
- `GET|PATCH|DELETE /api/external/sessions/{id}`
- `GET|POST /api/external/ideas`
- `GET|PATCH|DELETE /api/external/ideas/{id}`
- `POST /api/external/ideas/{id}/images`
- `DELETE /api/external/ideas/{id}/images/{imageId}`
- `GET|POST /api/external/orders`
- `GET|PATCH|DELETE /api/external/orders/{id}`
- `POST /api/external/orders/{id}/status`
- `GET|POST /api/external/media/albums`
- `GET|PATCH|DELETE /api/external/media/albums/{id}`
- `GET|PATCH /api/external/profile`
- `GET|POST /api/external/users`
- `GET|PATCH|DELETE /api/external/users/{id}`
- `GET|POST /api/external/tenants`
- `GET|PATCH /api/external/tenants/{id}`
- `GET /api/external/bondage-system`
- `GET /api/external/bondage-system/{id}`

Die API-Control-Seite zeigt Beispielpayloads, Curl-Vorlagen und Hinweise. Fuer echte App-Tests sollte der Bearer-Header genutzt werden.

### Einladungen

`GET /api/external/invites` liefert neben `usage` jetzt auch `items` und `invites`. Jeder Eintrag enthält `id`, `name`, `email`, `status`, `inviteUrl`/`url`, optional `token`, `createdAt`, `expiresAt`, `acceptedAt`/`usedAt`, `invitedBy` und `acceptedBy`. Admins sehen alle Einladungen der Seite, normale Benutzer die eigenen.

### Packlisten und Teilen

`POST/PATCH /api/external/packing/events` akzeptiert `listIds: string[]`, um Packlisten einem Pack-Event zuzuordnen. Die Event-Response enthält weiterhin `lists[]` und `progress`.

`POST /api/external/share` nutzt denselben Share-Mechanismus wie die Web-App. JSON: `{ channel: "email"|"telegram"|"push"|"all", targetType: "user"|"circle", targetId, entityType, entityId, title, href, text? }`. `href` muss ein interner Pfad sein, z. B. `/packing/meine-liste`.

### Kalender-Events

Der Protokoll/Eventfeed bleibt unter `GET /api/external/events`. Fuer echte Terminverwaltung gibt es kollisionsfrei `GET|POST /api/external/calendar-events`, `GET|PATCH|DELETE /api/external/calendar-events/{id}` und `POST|DELETE /api/external/calendar-events/{id}/check-in`. Eventfelder: `title`, `startsAt`, optional `location`, `description`. Check-in akzeptiert optional `note`.

### Katalog-Aktionen

Spielsachen und Szenen können extern gelöscht werden: `DELETE /api/external/catalog/toys/{id}` und `DELETE /api/external/catalog/positions/{id}`. Favoriten werden per `POST` gesetzt und per `DELETE` entfernt: `/api/external/catalog/toys/{id}/favorite` und `/api/external/catalog/positions/{id}/favorite`.

`PATCH /api/external/sessions/{id}` akzeptiert zusätzlich `toyIds`, `positionIds` und `bondageSystemItemIds`; übergebene Arrays ersetzen die jeweilige Relation vollständig.

`POST /api/external/catalog/reorder` sortiert Spielsachen oder Szenen neu:

```json
{ "kind": "toys", "ids": ["toy-id-1", "toy-id-2"] }
```

`kind` akzeptiert `toys`/`toy` oder `positions`/`position`. Die Reihenfolge wird als `sortOrder` gespeichert.

### Medien-Alben

Alben sind extern über `GET|POST /api/external/media/albums` und `GET|PATCH|DELETE /api/external/media/albums/{id}` verfügbar. Felder: `title`, `description`, `visibility`, `coverMediaId`.

Beim Löschen werden Bilder standardmäßig in das persönliche Hauptalbum verschoben. Mit `DELETE /api/external/media/albums/{id}?deleteMedia=true` werden die Medien des Albums gelöscht. Das persönliche Hauptalbum kann nicht gelöscht werden.

### Tracker-History-Detail

Tracker-Einträge haben zusätzlich zur Listenroute eigene Detail-Endpunkte:

```http
GET /api/external/trackers/history/{id}
PATCH /api/external/trackers/history/{id}
DELETE /api/external/trackers/history/{id}
```

`PATCH` akzeptiert `title`, `notes`/`note`, `startTime`/`startedAt`, `endTime`/`endedAt`, `allDay`, `fieldValues`, `toyIds`, `positionIds` und `bondageSystemItemIds`. Die Relationen werden bei übergebenen Arrays vollständig ersetzt.

### Tracker-Fotos

Tracker-Fotos sind eigene geschuetzte Anhaenge am Tracker-Eintrag und erscheinen nicht in der normalen Bildergalerie:

```http
GET /api/external/trackers/history/{id}/images
POST /api/external/trackers/history/{id}/images
GET /api/external/trackers/history/{id}/images/{imageId}
PATCH /api/external/trackers/history/{id}/images/{imageId}
DELETE /api/external/trackers/history/{id}/images/{imageId}
Authorization: Bearer fsp_...
```

`POST` akzeptiert `multipart/form-data` mit Pflichtfeld `file` und optional `title`, `note`.
`PATCH` akzeptiert JSON mit `title`, `note` oder `multipart/form-data`; wenn dort ein neues `file` mitkommt, wird die alte Datei vom Server entfernt und ersetzt.
`DELETE` loescht den Bildanhang und die geschuetzte Datei.

### Ideen- und Wiki-Bilder

Ideenbilder bleiben getrennt von der normalen Bildergalerie:

```http
POST /api/external/ideas/{id}/images
DELETE /api/external/ideas/{id}/images/{imageId}
```

Uploads sind `multipart/form-data` mit Feld `file` und optional `title`. Die Antwort enthält das aktualisierte Ideen-Objekt.

Wiki-Anhänge:

```http
POST /api/external/wiki/{id}/attachments
DELETE /api/external/wiki/{id}/attachments/{attachmentId}
```

Auch hier ist das Uploadfeld `file`. Anhänge werden als geschützte `FileAsset` gespeichert und beim Löschen vom Dateisystem entfernt.

### Profil, Benutzer und Seiten

Für native Profil- und Admin-Ansichten gibt es:

```http
GET /api/external/profile
PATCH /api/external/profile
GET /api/external/users
POST /api/external/users
GET /api/external/users/{id}
PATCH /api/external/users/{id}
DELETE /api/external/users/{id}
GET /api/external/tenants
POST /api/external/tenants
GET /api/external/tenants/{id}
PATCH /api/external/tenants/{id}
```

Benutzer- und Seitenverwaltung ist Admin/Superadmin-geschützt. `DELETE /api/external/users/{id}` deaktiviert Benutzer, statt sie hart zu löschen.

## Punktesystem

Admins konfigurieren im Backend unter `Einstellungen -> Punkte`, welche Audit-Aktion wie viele Punkte gibt oder abzieht. Die Vergabe haengt zentral an `logAction`: sobald eine Aktion protokolliert wird und eine aktive Punkteregel mit ungleich `0` existiert, entsteht eine Punktbuchung fuer den ausloesenden Benutzer.

### Punkte lesen

```http
GET /api/external/points?limit=30
Authorization: Bearer fsp_...
```

Antwort:

```json
{
  "ok": true,
  "user": { "id": "user-id", "displayName": "Name", "points": 42 },
  "leaderboard": [
    { "userId": "user-id", "displayName": "Name", "points": 42, "entries": 5 }
  ],
  "entries": [
    { "action": "toy_created", "points": 5, "title": "Spielzeug angelegt", "href": "/toys/..." }
  ]
}
```

### Punkteregeln verwalten

Nur Admin-/Superadmin-Tokens:

```http
GET /api/external/points/rules
POST /api/external/points/rules
Authorization: Bearer fsp_...
Content-Type: application/json

{ "action": "toy_created", "points": 5, "active": true }
```

`GET` liefert alle bekannten Aktionen mit lesbarer Beschriftung, aktuellem Punktwert und Aktivstatus. `POST` setzt oder aktualisiert genau eine Regel.

## Wiki

Das Wiki ist ein eigenes Feature (`wiki`) und nutzt in der Weboberflaeche Benutzer-Namensraeume statt technischer IDs:

- `/wiki`
- `/wiki/{benutzerSlug}`
- `/wiki/{benutzerSlug}/{seitenSlug}`

Native Apps nutzen die IDs aus der API, bekommen aber die lesbaren Webpfade mitgeliefert:

```http
GET /api/external/wiki?limit=50&q=...
POST /api/external/wiki
GET /api/external/wiki/{id}
PATCH /api/external/wiki/{id}
DELETE /api/external/wiki/{id}
POST /api/external/wiki/{id}/attachments
DELETE /api/external/wiki/{id}/attachments/{attachmentId}
```

Beispiel fuer `POST /api/external/wiki`:

```json
{
  "title": "Ablauf",
  "content": "== Ueberschrift ==\n\n'''Wichtig''' und [[Interner Link]]",
  "visibility": "PRIVATE"
}
```

Sichtbarkeit:

- `PRIVATE`: Besitzer und Admins
- `PARTNER`: eigener Zirkel
- `SHARED`: sichtbare Benutzer der Seite

Der Seiten-Slug wird automatisch aus dem Titel erzeugt. `GET /api/external/wiki/{id}` liefert `content` als MediaWiki-Rohtext, `mediaWikiExport` als exportierbaren `.wiki`-Text, `revisions[]` als kompaktes Aenderungsprotokoll und `images[]` fuer angehaengte Wiki-Bilder. Die Weboberflaeche kann `.wiki`-Dateien importieren und exportieren.

## Hinweise fuer Weiterentwicklung

- Native APNs-Zustellung und Device-Token-Registrierung sind in [08-native-pushnachrichten.md](./08-native-pushnachrichten.md) beschrieben.
- Wenn systemweite Ereignisse ohne Actor in der App erscheinen sollen, sollte `AuditLog` ein `tenantId` bekommen.
- Die Event-API ist bewusst lesend. Likes/Kommentare laufen weiterhin ueber die bestehenden Feed-/Protokollfunktionen.
