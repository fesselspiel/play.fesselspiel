# Projektdokumentation

Diese Dokumentation beschreibt den aktuellen Stand der Plattform, die bisher umgesetzten Anforderungen und die Schritte zur Reproduktion. Sie soll bei jeder weiteren Änderung am Projekt mitgepflegt werden.

## Dateien

- [01-projektueberblick.md](./01-projektueberblick.md): Zweck, Module, Design und aktueller Funktionsumfang.
- [02-reproduktion-und-deployment.md](./02-reproduktion-und-deployment.md): Lokaler Start, VPS-Deployment, Build, Smoke-Tests und Betrieb.
- [03-implementierungslog.md](./03-implementierungslog.md): Chronologische Zusammenfassung der bisher gebauten Features.
- [04-dateien-und-architektur.md](./04-dateien-und-architektur.md): Wichtige Dateien, Routen, Datenmodelle und Helfer.
- [05-prompts-und-anforderungen.md](./05-prompts-und-anforderungen.md): Urspruengliche und spätere Anforderungen aus dem Chat, inklusive Quellanhängen.
- [06-api-control-und-tracker-umbau.md](./06-api-control-und-tracker-umbau.md): API-Control, externe Endpunkte und Tracker-Umbau.
- [07-mobile-app-login.md](./07-mobile-app-login.md): Login, API-Token und Eventfeed fuer native Apps.
- [08-native-pushnachrichten.md](./08-native-pushnachrichten.md): APNs-Geraete, native Pushzustellung und Betriebsvariablen.

## Pflege-Regel

Wenn an der App weitergearbeitet wird, sollen diese Dateien aktualisiert werden:

1. Neue oder geänderte Features in `03-implementierungslog.md` ergänzen.
2. Neue Routen, Modelle, API-Endpunkte oder zentrale Helper in `04-dateien-und-architektur.md` nachtragen.
3. Deployment- oder Betriebsdetails in `02-reproduktion-und-deployment.md` aktualisieren.
4. Neue User-Prompts oder Richtungswechsel in `05-prompts-und-anforderungen.md` dokumentieren.

Secrets gehoeren nicht in diese Dokumentation. Bot-Token, Passwörter, API-Keys und private Logins werden nur als Platzhalter erwaehnt.
