# Projektdokumentation

Diese Dokumentation beschreibt den aktuellen Stand der Plattform, die bisher umgesetzten Anforderungen und die Schritte zur Reproduktion. Sie soll bei jeder weiteren Aenderung am Projekt mitgepflegt werden.

## Dateien

- [01-projektueberblick.md](./01-projektueberblick.md): Zweck, Module, Design und aktueller Funktionsumfang.
- [02-reproduktion-und-deployment.md](./02-reproduktion-und-deployment.md): Lokaler Start, VPS-Deployment, Build, Smoke-Tests und Betrieb.
- [03-implementierungslog.md](./03-implementierungslog.md): Chronologische Zusammenfassung der bisher gebauten Features.
- [04-dateien-und-architektur.md](./04-dateien-und-architektur.md): Wichtige Dateien, Routen, Datenmodelle und Helfer.
- [05-prompts-und-anforderungen.md](./05-prompts-und-anforderungen.md): Urspruengliche und spaetere Anforderungen aus dem Chat, inklusive Quellanhaengen.

## Pflege-Regel

Wenn an der App weitergearbeitet wird, sollen diese Dateien aktualisiert werden:

1. Neue oder geaenderte Features in `03-implementierungslog.md` ergaenzen.
2. Neue Routen, Modelle, API-Endpunkte oder zentrale Helper in `04-dateien-und-architektur.md` nachtragen.
3. Deployment- oder Betriebsdetails in `02-reproduktion-und-deployment.md` aktualisieren.
4. Neue User-Prompts oder Richtungswechsel in `05-prompts-und-anforderungen.md` dokumentieren.

Secrets gehoeren nicht in diese Dokumentation. Bot-Token, Passwoerter, API-Keys und private Logins werden nur als Platzhalter erwaehnt.
