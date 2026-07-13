# iOS-Sicherheit

## Lokale Sicherheit

- Zugangstoken liegen ausschliesslich im Keychain.
- Optionaler Face-ID-/Touch-ID-/Geraetcode-Lock mit Inaktivitaetsgrenze.
- Privacy Overlay verdeckt App-Inhalte im App Switcher.
- Datenexporte und temporaere Dateien verwenden vollstaendigen iOS-Dateischutz und werden nach Gebrauch entfernt.
- Fotos werden ueber den System-Photo-Picker gewaehlt; Kamera und Mikrofon werden erst bei konkreter Aktion angefragt.

## Transport und Benachrichtigungen

- Nur TLS-Endpunkte; keine Token in URLs oder sichtbaren Logs.
- Push-Vorschaumodus `Diskret` ist Standard.
- Diskrete Payloads enthalten weder private Titel/Notizen noch Entity- oder Medienmetadaten.
- `Vollstaendig` verlangt eine ausdrueckliche Warnbestaetigung.

## App-Metadaten

- `PrivacyInfo.xcprivacy` und Required-Reason-API-Nutzung vor jedem Store-Release gegen Xcode/ASC pruefen.
- `Info.plist` beschreibt Kamera, Mikrofon und Fotos in nutzerverstaendlicher Sprache.
- Deep Links werden erst nach Authentifizierung und serverseitiger Berechtigungspruefung geoeffnet.

## Releasepruefung

Mindestens kleiner und grosser iPhone-Simulator, iPad-Smoke, Dark Mode, grosse Dynamic-Type-Stufe, verweigerte Berechtigungen, Logout, App-Lock und Privacy Overlay pruefen. Ein echter On-Device-Test bleibt vor App-Store-Einreichung verpflichtend.
