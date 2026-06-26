# Native Pushnachrichten

## Ziel

Die iOS-App kann sich nach dem Mobile-Login mit ihrem APNs-Gerätetoken registrieren. Die Webapp verschickt sofortige Pushnachrichten, wenn Events geplant, geändert, gelöscht oder per Check-in bestätigt werden.

## Architektur

- `logAction` bleibt der zentrale Auslöser für Benachrichtigungen.
- Neue Event-Actions: `event_created`, `event_updated`, `event_deleted`, `event_checkin_created`.
- `NativePushDevice` speichert registrierte Geräte pro Nutzer, Tenant, Plattform und APNs-Umgebung.
- `NativePushDelivery` protokolliert jeden Versandversuch.
- `/api/external/push/devices` registriert oder deaktiviert Geräte über den bestehenden Bearer-Token der mobilen App.
- `dispatchNativePushNotifications` sendet nur bekannte Event-Actions. Andere Audit-Einträge erzeugen keine native Pushnachricht.

## Server-Konfiguration

APNs wird nicht über Start-Umgebungsvariablen konfiguriert. Administratoren pflegen die Werte pro Seite im Backend unter `Einstellungen -> Push`.

Gespeichert werden:

- Team ID
- Key ID
- Bundle ID, Standard: `fspiel.playplaner`
- APNs Private Key, verschlüsselt in der Datenbank
- Umgebung: `production` oder `sandbox`

Der APNs-Key ist ein Apple-Developer Push Notifications Auth Key, nicht der App-Store-Connect-Upload-Key.

Wenn die Push-Einstellung deaktiviert oder unvollständig ist, werden Events weiterhin protokolliert, aber es wird kein APNs-Versand versucht.

## iOS-Verhalten

- Nach erfolgreichem Login fragt die App nach Push-Berechtigung.
- Nach APNs-Registrierung sendet die App den Gerätetoken an `/api/external/push/devices`.
- Debug-Builds registrieren `sandbox`, Release/TestFlight registriert `production`.
- Beim Abmelden deaktiviert die App den gespeicherten Gerätetoken serverseitig.

## Bewusste Grenzen

- Diese Version sendet sofortige Pushes bei Event-Aktionen.
- Zeitgesteuerte Erinnerungen vor Eventstart sind noch nicht enthalten.
- Android/FCM ist durch das Plattformfeld vorbereitet, aber noch nicht umgesetzt.
