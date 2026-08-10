# ioBroker-Adapter-Contract

Diese Datei beschreibt die Portal-Schnittstelle für einen später separat zu bauenden ioBroker-Adapter `iobroker.playplaner`.

Der Adapter gehört nicht in das Playplaner-Portal-Repository. Playplaner bleibt die fachliche Source of Truth für Tracker, Sessions, Regeln, Zeitlogik, Berechtigungen, Audit und Bilder. Der Adapter ist nur die lokale Bridge ins LAN.

## Authentifizierung

Der Adapter verwendet einen normalen Playplaner-API-Token:

```http
Authorization: Bearer fsp_...
```

Der Token wird im Portal unter `Einstellungen > API-Tokens` angelegt. Er muss mindestens Zugriff auf externe API, Automation und Tracker haben. Tokens gehören nicht in `.env`.

## Grundablauf

1. Adapter startet und sendet Heartbeat.
2. Adapter synchronisiert lokale ioBroker-Geräte und Capabilities.
3. Adapter pollt regelmäßig Commands.
4. Playplaner markiert fällige Geräteaktionen als `READY`.
5. Beim Abholen werden Commands atomar auf `RUNNING` gesetzt.
6. Adapter führt lokal aus.
7. Adapter meldet Ergebnis zurück.
8. Portal schreibt Automation-Events und normale AuditLogs.

## Heartbeat

```http
POST /api/external/automation/adapter/heartbeat
Content-Type: application/json
Authorization: Bearer fsp_...
```

```json
{
  "health": "ONLINE",
  "metadata": {
    "adapterVersion": "0.1.0",
    "iobrokerHost": "raspi",
    "uptimeSeconds": 1234
  }
}
```

Antwort:

```json
{
  "ok": true,
  "item": {
    "enabled": true,
    "health": "ONLINE",
    "heartbeatAt": "2026-08-10T18:00:00.000Z"
  }
}
```

## Geräte und Capabilities synchronisieren

```http
POST /api/external/automation/devices
Content-Type: application/json
Authorization: Bearer fsp_...
```

```json
{
  "logicalId": "bedroom-camera",
  "name": "Kamera Schlafzimmer",
  "integration": "IOBROKER",
  "health": "ONLINE",
  "status": {
    "ip": "192.168.x.x"
  },
  "capabilities": [
    {
      "key": "camera",
      "kind": "Camera",
      "title": "Bild anfordern",
      "state": "ONLINE",
      "actions": ["request_image", "health_check"],
      "events": ["image_uploaded", "camera_offline", "camera_online"],
      "conditions": ["is_online", "last_image_younger_than"],
      "parameters": {
        "timeoutSeconds": 20
      },
      "ui": {
        "icon": "camera"
      }
    }
  ]
}
```

`logicalId` ist pro Seite eindeutig. Wird dasselbe Gerät erneut gesendet, aktualisiert Playplaner Name, Status und Capabilities.

## Commands abholen

```http
GET /api/external/automation/adapter/commands?limit=25
Authorization: Bearer fsp_...
```

Der Endpunkt:

- führt zuerst fällige Server-Actions aus,
- stellt fällige Geräte-/Capability-Actions auf `READY`,
- claimt abrufbare Actions atomar für den Adapter,
- setzt sie auf `RUNNING`,
- liefert sie als Command-Liste zurück.

Antwort:

```json
{
  "ok": true,
  "count": 1,
  "items": [
    {
      "id": "act_...",
      "type": "camera_request_image",
      "status": "RUNNING",
      "target": null,
      "payloadJson": {
        "requestId": "img_...",
        "reason": "Sessionbild"
      },
      "correlationId": "session_...",
      "session": {
        "id": "session_...",
        "state": "RUNNING"
      },
      "device": {
        "id": "dev_...",
        "logicalId": "bedroom-camera",
        "name": "Kamera Schlafzimmer"
      },
      "capability": {
        "id": "cap_...",
        "key": "camera",
        "kind": "Camera",
        "title": "Bild anfordern"
      }
    }
  ]
}
```

## Command-Ergebnis zurückmelden

```http
POST /api/external/automation/adapter/commands/{id}/result
Content-Type: application/json
Authorization: Bearer fsp_...
```

Erfolg:

```json
{
  "success": true,
  "result": {
    "message": "Bild erfolgreich angefordert"
  },
  "deviceState": {
    "lastCommand": "camera_request_image"
  },
  "capabilityState": "ONLINE",
  "capabilityStateJson": {
    "lastSuccessAt": "2026-08-10T18:00:00.000Z"
  }
}
```

Fehler:

```json
{
  "success": false,
  "error": "Kamera nicht erreichbar",
  "deviceState": {
    "lastError": "timeout"
  },
  "capabilityState": "ERROR"
}
```

Playplaner setzt die Action auf `SUCCEEDED` oder `FAILED`, aktualisiert bekannte Device-/Capability-Zustände und schreibt `automation_action_succeeded` oder `automation_action_failed`.

## Geräteevents melden

```http
POST /api/external/automation/events
Content-Type: application/json
Authorization: Bearer fsp_...
```

```json
{
  "type": "camera_online",
  "title": "Kamera ist wieder erreichbar",
  "deviceId": "dev_...",
  "capabilityId": "cap_...",
  "deviceHealth": "ONLINE",
  "capabilityState": "ONLINE",
  "details": {
    "latencyMs": 130
  },
  "raw": {
    "iobrokerState": "devices.camera.online"
  }
}
```

Der Endpunkt ist tenant-sicher: fremde oder ungültige Device-/Capability-IDs werden nicht übernommen.

## Kamerabilder hochladen

Eine Bildanforderung enthält im Command-Payload eine `requestId`. Der Adapter lädt das Bild danach per HTTPS hoch:

```http
POST /api/external/automation/image-requests/{requestId}/upload
Content-Type: multipart/form-data
Authorization: Bearer fsp_...

file=@snapshot.png
```

Wichtig:

- Bilder werden nicht über MQTT übertragen.
- Der Adapter ruft die Kamera lokal ab.
- Playplaner speichert das Bild als geschütztes `FileAsset`.
- Das Bild hängt an `AutomationImageRequest` und damit an der Automation-Session.

## Polling-Empfehlung

- Heartbeat: alle 30 bis 60 Sekunden.
- Commands: alle 2 bis 5 Sekunden, später optional Long Polling.
- Devices: beim Adapter-Start und danach bei Konfigurationsänderungen.
- Events: sofort bei Zustandswechseln oder lokalen Fehlern.

## Was der Adapter nicht tun darf

- keine eigene Session-Logik
- keine eigene Verzögerungslogik
- keine eigene Quotenberechnung
- keine direkte Datenbankverbindung
- keine Playplaner-Dateipfade kennen
- keine Bilder als Base64 über MQTT schicken
- keine fachlichen Entscheidungen treffen, die im Portal liegen

## Minimaler Prompt für das Adapter-Projekt

Baue einen ioBroker-Adapter `iobroker.playplaner`. Der Adapter läuft separat in ioBroker und verbindet sich mit Playplaner ausschließlich über die externe API. Verwende einen im Portal erzeugten Bearer Token, nicht `.env`. Der Adapter sendet Heartbeats an `/api/external/automation/adapter/heartbeat`, synchronisiert Geräte über `/api/external/automation/devices`, pollt Commands über `/api/external/automation/adapter/commands`, meldet Ergebnisse an `/api/external/automation/adapter/commands/{id}/result`, meldet lokale Events an `/api/external/automation/events` und lädt Kamerabilder über `/api/external/automation/image-requests/{requestId}/upload` hoch. Keine fachliche Session-, Tracker-, Quoten- oder Regel-Logik im Adapter nachbauen; Playplaner ist die Source of Truth.
