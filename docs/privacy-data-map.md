# Privacy Data Map

Stand: 2026-07-14

| Datenbereich | Zweck | Sichtbarkeit/Empfaenger | Speicher/Lebenszyklus | Nutzerkontrolle |
| --- | --- | --- | --- | --- |
| Konto und Profil | Anmeldung, Identitaet, Personalisierung | Nutzer, erlaubte Kreis-/Tenant-Kontexte | Bis Kontoloeschung oder gesetzliche Frist | Bearbeiten, Export, Loeschung |
| Kreis und Einladungen | Private Zusammenarbeit | Eingeladene Mitglieder | Bis Widerruf, Austritt oder Loeschung | Austritt, Share-Widerruf |
| Planung und Zustimmung | Vorschlag, Termin, Status, Revision | Berechtigte Beteiligte | Bis Einzel- oder Kontoloeschung | Ablehnen, Gegenvorschlag, Widerruf |
| Chat und Kommentare | Private Kommunikation | Gewaehlter Kreis/Empfaenger | Bis Inhalt- oder Kontoloeschung | Loeschen, melden, blockieren |
| Bilder, Videos, Alben | Private Dokumentation | Gemaess PRIVATE/PARTNER/SHARED | Datei und Datensatz werden gemeinsam bereinigt | Sichtbarkeit, Loeschen, melden |
| Tracker und Kalender | Zeit-/Aktivitaetsdokumentation | Nutzer und freigegebene Kreise | Bis Eintrag- oder Kontoloeschung | Bearbeiten, loeschen, exportieren |
| Tagebuch, Ideen, Sammlungen | Persoenliche Dokumentation | Gewaehlte Freigabe | Bis Inhalt- oder Kontoloeschung | Bearbeiten, Freigabe, loeschen |
| Push-Geraet | APNs-Zustellung | Apple APNs, Server | Bis Deaktivierung, Logout oder Kontoloeschung | Geraet deaktivieren, Push widerrufen |
| Telegram | Optionale Benachrichtigung/Integration | Telegram nur nach Einwilligung | Nach Konfiguration und Anbieterregeln | Einwilligung und Token widerrufen |
| OpenAI | Optionale Transkription/Assistenz | OpenAI nur bei konkreter Aktion/Einwilligung | Minimiert nach Funktions- und Anbieterregeln | Einwilligung widerrufen; Audiodatei nach Erfolg loeschen |
| Shopify | Import physischer Produkte | Aktivierter Shop und berechtigte Nutzer | Solange Integration/Import besteht | Integration deaktivieren |
| Audit, Meldung, Moderation | Sicherheit und Nachweis | Berechtigte Administratoren | Datensparsam nach Sicherheits-/Rechtsbedarf | Auskunft; Inhalte werden nicht ins Audit dupliziert |
| IP-/Zugriffsprotokolle | Betriebssicherheit, Missbrauchsschutz und Rate Limiting | Betreiber; HMAC-Rate-Limit-Schluessel in der App-Datenbank, IP in Reverse-Proxy-Zugriffslogs | Kurzlebige Rate-Limits; Nginx rotiert taeglich und behaelt 14 Rotationen | Auskunft und Loesch-/Aufbewahrungskonzept |
| Datenexport | Maschinenlesbare Nutzerkopie | Nur authentifizierter Nutzer | Temporaere ZIP-Datei mit iOS-Dateischutz | Share Sheet; lokale Temp-Datei wird geloescht |

## Technische Grenzen

- API-Token nur als Bearer-Header; iOS speichert sie im Keychain.
- Direkte Datei-URLs pruefen Tenant, Kreis, Sichtbarkeit, Blockierung und Quarantaene.
- Diskrete Push-Vorschau ist Standard und enthaelt keine privaten Titel, Notizen oder Medien.
- Optionale Einwilligungen fuer Telegram, OpenAI, Push und Analyse werden getrennt gespeichert und sind widerrufbar.
- Kontoloeschung sperrt neue Logins, widerruft Tokens/Geraete und bereinigt relationale sowie physische Daten idempotent.
- Die daraus abgeleiteten App-Store-Datenschutzangaben sind unter `app-store-privacy-labels.md` dokumentiert. Der ASC-Zustand muss vor jeder Einreichung erneut damit abgeglichen werden.
