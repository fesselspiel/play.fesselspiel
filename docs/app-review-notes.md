# App Review Notes

Stand: 2026-07-14

## Produkt und Zugang

Playplaner ist ein privater, einladungsbasierter Planer fuer volljaehrige Einzelpersonen, Paare und vertraute Kreise. Es gibt keine oeffentliche Partnersuche, keine Discovery, keinen anonymen oder zufaelligen Chat und keinen oeffentlichen Medienfeed.

Der dauerhaft erreichbare Review-Mandant liegt unter `https://test.playplaner.com`. Die Zugangsdaten fuer Alex, Sam, Review Admin und Delete Test werden ausschliesslich im geschuetzten Feld `App Review Information` in App Store Connect hinterlegt. Passwoerter liegen nicht im Repository.

Der neutrale Review-Datensatz enthaelt:

- einen gemeinsamen Kreis `App Review`,
- zwei normale Benutzer Alex und Sam sowie einen Administrator,
- eine offene Anfrage und eine geplante Aktivitaet,
- neutrale Szenen, Ausruestung, Tracker und Kalendereintraege,
- neutrale Chatnachrichten, ein Tagebuch und ein unbedenkliches Bild,
- einen harmlosen offenen Testfall fuer die Moderationswarteschlange,
- ein separates Konto `Delete Test` fuer die vollstaendige Kontoloeschung.

## Wichtige Review-Wege

1. Mit Alex anmelden. Die Startseite zeigt aktuelle Anfrage, naechste Aktivitaet, Tracker und Timeline.
2. Kalender, Chat, Bilder, Tagebuch, Szenen und Spielsachen ueber die native Navigation oeffnen.
3. Eine fremde Chatnachricht oder einen fremden Inhalt lange druecken, um `Melden`, `Nutzer blockieren` und `Ausblenden` zu pruefen.
4. Mit Review Admin anmelden und `Setup -> Erweitert -> Verwaltung -> Moderation` oeffnen.
5. Unter `Setup -> Datenschutz & Konto` Datenschutz, Datenexport, Sitzungen, Zirkel und Kontoloeschung pruefen.
6. Fuer einen destruktiven Loeschtest ausschliesslich das Konto Delete Test verwenden.

## Schutzmassnahmen

- Medien sind privat und kreisgebunden. Unbekannte, explizite und quarantinisierte Inhalte werden in iOS standardmaessig verdeckt; quarantinisierte Dateien werden serverseitig nicht ausgeliefert.
- Push-Vorschauen sind standardmaessig `Diskret`. Sie enthalten keine privaten Titel, Notizen, Entity-Metadaten, Kreisnamen, Bild-URLs oder Deep-Link-URLs.
- Gemeinsame Planungen brauchen eine ausdrueckliche, versionsgebundene Zustimmung. Ablehnen, andere Zeit vorschlagen und Zustimmung widerrufen bleiben erreichbar.
- Auftraege sind freiwillige private Vorschlaege. Es gibt keine Bestrafung, Challenges oder automatische Verlaengerung bei Ablehnung oder Abbruch.
- Die App ist ein Organisationswerkzeug und kein Sicherheits-, Ueberwachungs- oder Rettungssystem.
- Telegram, OpenAI und Push bleiben optionale Funktionen.

## Kontoloeschung

Der native Weg ist `Setup -> Datenschutz & Konto -> Konto loeschen`. Nach Information ueber die Folgen muss exakt `KONTO LOESCHEN` eingegeben werden. Die App startet eine echte serverseitige Loeschung; reine Deaktivierung ist nicht der Endzustand. Der letzte Administrator eines Mandanten wird mit einem klaren Hinweis geschuetzt.

## Reproduzierbarkeit und Rueckbau

Der Review-Mandant wird idempotent erzeugt:

```bash
npm run review:seed
```

Er wird ausschliesslich anhand der reservierten `app-review-*`-Konten und Marker entfernt:

```bash
npm run review:cleanup
```

Die vier Passwoerter werden als `APP_REVIEW_*_PASSWORD` aus einer lokalen, nicht versionierten Environment-Datei uebergeben. Der Cleanup entfernt keine anderen Benutzer oder Inhalte des Test-Mandanten.
