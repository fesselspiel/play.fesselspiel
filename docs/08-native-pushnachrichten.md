# Native Pushnachrichten

## Ziel

Die iOS-App kann sich nach dem Mobile-Login mit ihrem APNs-Gerätetoken registrieren. Die Android-App registriert ihren FCM Registration Token. Die Webapp verschickt sofortige Pushnachrichten, wenn passende Aktionen protokolliert werden und eine Push-Regel dafür aktiv ist.

## Architektur

- `logAction` bleibt der zentrale Auslöser für Benachrichtigungen.
- Neue Event-Actions: `event_created`, `event_updated`, `event_deleted`, `event_checkin_created`.
- `NativePushDevice` speichert registrierte Geräte pro Nutzer, Tenant, Plattform und Umgebung.
- `NativePushDelivery` protokolliert jeden Versandversuch.
- `/api/external/push/devices` registriert oder deaktiviert Geräte über den bestehenden Bearer-Token der mobilen App.
- `dispatchNativePushNotifications` sendet an iOS über APNs und an Android über FCM HTTP v1.
- Die Nutzlast enthält zusätzlich strukturierte Routing-Felder fuer die App. Details stehen in [07-native-push-payloads-und-ios-routing.md](./07-native-push-payloads-und-ios-routing.md).

## Server-Konfiguration

APNs und FCM werden nicht über Start-Umgebungsvariablen konfiguriert. Administratoren pflegen die Werte pro Seite im Backend unter `Einstellungen -> Push`.

Gespeichert werden:

### APNs

- Team ID
- Key ID
- Bundle ID, Standard: `fspiel.playplaner`
- APNs Private Key, verschlüsselt in der Datenbank
- Umgebung: `production` oder `sandbox`

Der APNs-Key ist ein Apple-Developer Push Notifications Auth Key, nicht der App-Store-Connect-Upload-Key.

### FCM

- FCM Project ID, z. B. `playplaner-efc74`
- Firebase Service Account JSON oder Base64-kodiertes JSON
- Das Service Account JSON wird verschlüsselt in der Datenbank gespeichert.

Wenn die Push-Einstellung deaktiviert oder für eine Plattform unvollständig ist, werden Geräte weiterhin registriert und Events protokolliert. Der Versand für diese Plattform wird dann als fehlgeschlagen protokolliert oder übersprungen.

## iOS-Verhalten

- Nach erfolgreichem Login fragt die App nach Push-Berechtigung.
- Nach APNs-Registrierung sendet die App den Gerätetoken an `/api/external/push/devices`.
- Debug-Builds registrieren `sandbox`, Release/TestFlight registriert `production`.
- Beim Abmelden deaktiviert die App den gespeicherten Gerätetoken serverseitig.
- Beim Antippen einer Pushnachricht kann die App `target.screen`, `target.id` und `target.href` auswerten und direkt in die passende Ansicht springen.

## Android-Verhalten

- Nach erfolgreichem Login erzeugt Firebase Messaging einen FCM Registration Token.
- Die App registriert den Token über `/api/external/push/devices` mit `platform: "android"` und `environment: "production"`.
- `deviceToken` bleibt unverändert erhalten; er wird nicht wie ein APNs-Token normalisiert.
- Beim Abmelden deaktiviert die App den gespeicherten Gerätetoken serverseitig.

Beispiel:

```http
POST /api/external/push/devices
Authorization: Bearer fsp_...
Content-Type: application/json

{
  "platform": "android",
  "environment": "production",
  "deviceToken": "<FCM registration token>",
  "deviceName": "Pixel 8"
}
```

## Bewusste Grenzen

- Zeitgesteuerte Erinnerungen vor Eventstart sind noch nicht enthalten.
