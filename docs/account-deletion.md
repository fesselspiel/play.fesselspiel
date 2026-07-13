# Vollstaendige Kontoloeschung

## Nutzerfluss

Der native Weg liegt unter `Setup -> Datenschutz & Konto -> Konto loeschen`. Die erste Stufe erklaert die Folgen. Die zweite Stufe verlangt den eindeutigen Text `KONTO LOESCHEN`. Ein normaler Nutzer braucht keinen Supportkontakt und keine Adminrolle.

## Serverablauf

1. Identitaet, Tenant und letzter-Admin-Schutz pruefen.
2. `AccountDeletionJob` idempotent anlegen und neue Authentifizierung sperren.
3. API-Tokens, Websessions, Push-Geraete, Reset-/Invite-/Share-Verbindungen widerrufen.
4. Persoenliche Relationen transaktional loeschen oder datensparsam anonymisieren.
5. Physische Dateien anhand der im Job inventarisierten Storage-Pfade entfernen.
6. Fehlerstatus wiederaufnehmbar speichern, ohne geloeschte Inhalte ins Audit zu kopieren.

## Verifizierter Nachweis

- Reales Testkonto mit Profil, Beziehungen, Token und physischer Datei geloescht.
- Token und Login danach nicht mehr verwendbar.
- Datei weder ueber API noch im Storage vorhanden.
- Partnerkonto und dessen eigene Daten blieben bestehen.
- Letzter Tenant-Admin erhielt HTTP 409 und wurde nicht veraendert.

## Rueckbau

Code, Route und additive Jobstruktur koennen per dokumentiertem Commit-Revert entfernt werden. Eine bereits bestaetigte Kontoloeschung ist absichtlich nicht rueckgaengig. Fehlgeschlagene Jobs duerfen erst nach erfolgreicher Dateibereinigung geloescht werden.
