# Native Pushnachrichten

## Ziel

Die iOS-App kann sich nach dem Mobile-Login mit ihrem APNs-Gerätetoken registrieren. Die Android-App registriert ihren FCM Registration Token. Die Webapp verschickt sofortige Pushnachrichten, wenn passende Aktionen protokolliert werden und eine Push-Regel dafür aktiv ist.

## Architektur

- `logAction` bleibt der zentrale Auslöser für Benachrichtigungen.
- Neue Event-Actions: `event_created`, `event_updated`, `event_deleted`, `event_checkin_created`.
- `NativePushDevice` speichert registrierte Geräte pro Nutzer, Tenant, Plattform, Umgebung und nativer App.
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
- Native Apps registrieren ihre erlaubte Bundle-ID als `appIdentifier`. `fspiel.playplaner` bleibt der kompatible Standard; `fspiel.playtracker` kennzeichnet PlayTracker. APNs verwendet pro Gerät genau dieses Topic.

## Tracker-Kontingent-Erinnerungen

Ein Tracker kann neben `quotaReminderEnabled` einen `quotaReminderSchedule` enthalten. Darin werden Tages-, Wochen- und Monatsziel unabhängig aktiviert und mit Startzeit sowie Wiederholungsabstand konfiguriert. Für Wochenziele ist der erste Wochentag frei wählbar; danach kann im Abstand von 1 bis 7 Tagen erinnert werden. Für Monatsziele wird ein erster Tag von 1 bis 28 oder der letzte Monatstag gewählt; danach sind Abstände von 1 bis 28 Tagen möglich. Tagesregeln unterstützen zusätzlich stündliche Abstände. Der Tracker-Cron prüft im 15-Minuten-Raster und erinnert nur, wenn die jeweilige Regel fällig und das zugehörige Kontingent tatsächlich offen ist. Empfänger sind alle Benutzer, für die der Tracker sichtbar ist und deren eigenes Kontingent noch offen ist. Der Server schreibt keine feste Uhrzeit und keinen festen Periodentag vor. Ein vollständiges, deaktiviertes oder nicht vorhandenes Kontingent erzeugt keine Erinnerung.

Die Erinnerung wird direkt an die betroffene Person versandt und benötigt keine zusätzliche allgemeine Push-Regel. PlayTracker-Geräte erhalten ausschließlich Tracker-Ereignisse und `native_push_test`; andere Ereignisse bleiben beim Playplaner-Topic. Die neutrale Payload verwendet `action=tracker_quota_reminder`, `target.screen=quotas` und den Tracker-Key als `target.id`. Das verhindert appfremde Navigation und hält Sperrbildschirmtexte diskret.

Externe Automationen können dieselbe neutrale Erinnerung über `GET` oder `POST /api/external/trackers/{trackerKey}/remind` anstoßen. Bearer-Authentifizierung ist bevorzugt; für Fritzbox-, Alexa- und andere einfache Webhooks bleibt ein API-Token als `?token=` zulässig. Optional beschreibt `source` den Auslöser. `delayMinutes` verschiebt den Zielzeitpunkt um 0 bis 10.080 Minuten. Verzögerte Aufrufe werden als persistente `TrackerReminderJob`-Datensätze gespeichert und vom bestehenden Tracker-Cron verarbeitet; vor der tatsächlichen Zustellung prüft der Server Trackerzugriff und Kontingent erneut. Die Zustellung erfolgt beim nächsten Cronlauf, regulär innerhalb von 15 Minuten nach dem Zielzeitpunkt. Der Aufruf erinnert ausschließlich den Benutzer des verwendeten Tokens, nur bei einem offenen Kontingent und höchstens einmal in 15 Minuten. Die externe Automation entscheidet beispielsweise über Anwesenheit; der Server vertraut dieser Angabe nicht als eigenen Sicherheitsnachweis.

Rückbau nach einem Release-Commit: Commit mit `git revert <commit>` ohne Force-Push zurücknehmen und regulär neu deployen. Die beiden additiven Datenbankspalten können für einen reinen Code-Rückbau bestehen bleiben; ein physischer Schema-Rückbau darf erst erfolgen, wenn keine neu registrierten App-Topics beziehungsweise Intervallwerte mehr benötigt werden.

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

- Zeitgesteuerte Erinnerungen vor Eventstart sind weiterhin nicht enthalten; Tracker-Kontingent-Erinnerungen sind ein eigener Flow.
