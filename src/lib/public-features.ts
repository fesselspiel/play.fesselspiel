export type PublicFeature = {
  slug: string;
  navTitle: string;
  title: string;
  eyebrow: string;
  summary: string;
  description: string[];
  icon: string;
  highlights: string[];
  walkthrough: string[];
  cta: string;
  mockup: {
    title: string;
    subtitle: string;
    primary: string;
    rows: { label: string; value: string; tone?: "red" | "green" | "blue" | "neutral" }[];
  };
};

export const publicFeatures: PublicFeature[] = [
  {
    slug: "start-und-spielampel",
    navTitle: "Start",
    title: "Startseite und Spielampel",
    eyebrow: "Gemeinsames Signal",
    summary: "Seht auf einen Blick, wer gerade offen ist, was ansteht und welche Aktionen wichtig sind.",
    description: [
      "Die Startseite ist der gemeinsame Puls der Seite. Sie zeigt Spielampel, offene Anfragen, Aufträge, Tracker-Todos und den Feed in einer klaren Reihenfolge.",
      "Die Spielampel ist bewusst schnell: ein Klick setzt den Status, Ablaufzeiten verhindern alte Signale und Likes zeigen, dass die andere Person es gesehen hat."
    ],
    icon: "Signal",
    highlights: ["Ampel pro Person", "Ablaufzeit mit Rückstellung", "Feed aus echten Aktionen", "Sortierbare Startbereiche"],
    walkthrough: [
      "Auf der Startseite die eigene Ampel antippen.",
      "Grün setzt ein aktives Signal, Gelb zeigt flexible Bereitschaft.",
      "Die Restzeit wird angezeigt und nach Ablauf automatisch zurückgesetzt.",
      "Offene Anfragen, Aufträge und Tracker-Todos direkt von dort öffnen."
    ],
    cta: "Zur Startseite nach dem Login",
    mockup: {
      title: "Start",
      subtitle: "Heute im Kreis",
      primary: "Lina ist grün",
      rows: [
        { label: "Mika", value: "flexibel", tone: "blue" },
        { label: "Offener Auftrag", value: "1", tone: "red" },
        { label: "Tracker-Todo", value: "2 h offen", tone: "neutral" }
      ]
    }
  },
  {
    slug: "spielplanung-und-auftraege",
    navTitle: "Spielplan",
    title: "Spielplanung und Aufträge",
    eyebrow: "Aus Idee wird Vorhaben",
    summary: "Plant Spieltermine, Aufträge und spätere Vorhaben ohne durcheinandergeratene Chats.",
    description: [
      "Spielplanung trennt einfache gemeinsame Termine von Aufträgen. Eine Anfrage bleibt sichtbar, bis sie bestätigt wurde; ein Auftrag kann angenommen, geändert oder umgesetzt werden.",
      "Benachrichtigungen laufen über dieselben Aktionsregeln wie Telegram, E-Mail, Push und externe Auslöser."
    ],
    icon: "CalendarDays",
    highlights: ["Anfragen und Bestätigung", "Aufträge", "Statusfluss", "Benachrichtigungen bei Änderungen"],
    walkthrough: [
      "Spieltermin oder Auftrag erstellen.",
      "Datum, Uhrzeit oder 'ohne Uhrzeit' wählen.",
      "Empfänger sehen die Anfrage prominent auf der Startseite.",
      "Nach Bestätigung verschwindet sie aus den offenen Punkten und landet im Plan."
    ],
    cta: "Spielplan öffnen",
    mockup: {
      title: "Spielplan",
      subtitle: "Diese Woche",
      primary: "Anfrage wartet",
      rows: [
        { label: "Heute", value: "Auftrag", tone: "red" },
        { label: "Morgen", value: "Spieltermin", tone: "green" },
        { label: "Status", value: "angefragt", tone: "blue" }
      ]
    }
  },
  {
    slug: "szenen",
    navTitle: "Szenen",
    title: "Szenen und Positionen",
    eyebrow: "Baukasten",
    summary: "Sammelt Szenen mit Bild, Beschreibung, Beauftragungsoption und passenden Spielsachen.",
    description: [
      "Szenen sind wiederverwendbare Bausteine. Sie lassen sich mit Spielsachen, Shopify-Produkten und Trackern verbinden.",
      "Kategorien und Favoriten halten lange Listen übersichtlich, ohne wichtige Details zu verstecken."
    ],
    icon: "PanelsTopLeft",
    highlights: ["Kategorien", "Favoriten", "Kann beauftragt werden", "Verknüpfte Spielsachen"],
    walkthrough: [
      "Neue Szene anlegen oder bestehende Kategorie öffnen.",
      "Bild hochladen und Ausschnitt passend setzen.",
      "Beschreibung und Beauftragungsoption speichern.",
      "Verknüpfte Spielsachen auswählen und später direkt aus der Szene öffnen."
    ],
    cta: "Szenen ansehen",
    mockup: {
      title: "Szenen",
      subtitle: "Favoriten oben",
      primary: "Rückenlage",
      rows: [
        { label: "Kategorie", value: "Vorbereitung", tone: "neutral" },
        { label: "Auftrag", value: "möglich", tone: "green" },
        { label: "Verknüpft", value: "3 Spielsachen", tone: "blue" }
      ]
    }
  },
  {
    slug: "spielsachen-und-bondage-system",
    navTitle: "Spielsachen",
    title: "Spielsachen und Shopify-Produkte",
    eyebrow: "Ausrüstung",
    summary: "Dokumentiert private Ausrüstung und importiert ausgewählte Shopify-Produkte in einen eigenen Bereich.",
    description: [
      "Spielsachen haben Bilder, Beschreibungen, Kategorien, Favoriten und Verknüpfungen zu Szenen. Shopify-Produkte können übernommen und getrennt dargestellt werden.",
      "Die Darstellung ist kompakt, aufklappbar und sortierbar, damit auch größere Sammlungen schnell bedienbar bleiben."
    ],
    icon: "ToyBrick",
    highlights: ["Bild und Beschreibung", "Kategorien", "Shopify-Sync", "Sortierung und Favoriten"],
    walkthrough: [
      "Spielsache anlegen oder aus Shopify-Produkten aktivieren.",
      "Foto hochladen, transparentes PNG bleibt transparent.",
      "Kategorie auswählen oder neu anlegen.",
      "Mit Szenen verbinden und Favoriten markieren."
    ],
    cta: "Spielsachen öffnen",
    mockup: {
      title: "Spielsachen",
      subtitle: "Kategorie geöffnet",
      primary: "Leder-Manschetten",
      rows: [
        { label: "Favorit", value: "Lina", tone: "red" },
        { label: "Szenen", value: "2 verknüpft", tone: "blue" },
        { label: "Shopify", value: "optional", tone: "neutral" }
      ]
    }
  },
  {
    slug: "bildergalerie",
    navTitle: "Bilder",
    title: "Bildergalerie und Alben",
    eyebrow: "Bildzentriert",
    summary: "Geschützte Bilder, Alben, Zuschnitt, Vollbildansicht und Kommentare in einer Galerie.",
    description: [
      "Die Bilderseite ist bewusst bildzentriert. Alben erscheinen als Cover-Raster, Bilder als schnelles Grid und Details erst, wenn du sie brauchst.",
      "Uploads werden geschützt ausgeliefert, können zugeschnitten, kommentiert, verschoben und einzeln in der Sichtbarkeit angepasst werden."
    ],
    icon: "Images",
    highlights: ["Album-Cover", "Vollbildansicht", "Kommentare", "Geschützte Dateien"],
    walkthrough: [
      "Album auswählen oder neues Album anlegen.",
      "Bild hochladen und Ausschnitt setzen.",
      "In der Detailansicht Notiz, Album und Sichtbarkeit ändern.",
      "Im Vollbild mit Pfeilen durch das Album blättern."
    ],
    cta: "Bilder ansehen",
    mockup: {
      title: "Bilder",
      subtitle: "Album Raster",
      primary: "Wochenende",
      rows: [
        { label: "Bilder", value: "24", tone: "blue" },
        { label: "Sichtbarkeit", value: "Kreis", tone: "green" },
        { label: "Kommentar", value: "neu", tone: "red" }
      ]
    }
  },
  {
    slug: "tracker",
    navTitle: "Tracker",
    title: "Tracker, Kontingente und Jahresübersichten",
    eyebrow: "Dokumentation",
    summary: "Trackt beliebige Zeitarten wie Segufix oder KG mit Jahreskalender, Details und To-dos.",
    description: [
      "Tracker sind generisch aufgebaut. Admins konfigurieren Tracker-Typen, Farben, Felder und Kontingente; Benutzer starten, stoppen und dokumentieren Einträge.",
      "Kontingente zeigen, was täglich, wöchentlich oder monatlich noch offen ist. Externe Systeme können diese Werte per API abfragen."
    ],
    icon: "Timer",
    highlights: ["Generische Tracker", "Jahreskalender", "Kontingente", "API und Alexa-fähig"],
    walkthrough: [
      "Tracker öffnen und passenden Tab wählen.",
      "Eintrag starten, beenden oder ganzen Tag markieren.",
      "Stimmung, Notizen und Verknüpfungen ergänzen.",
      "Jahresfelder anklicken, um Details oder neue Einträge zu öffnen."
    ],
    cta: "Tracker öffnen",
    mockup: {
      title: "Tracker",
      subtitle: "Segufix",
      primary: "Heute 01:45 h",
      rows: [
        { label: "Woche", value: "3 h offen", tone: "red" },
        { label: "Stimmung", value: "🙂 besser", tone: "green" },
        { label: "Jahr", value: "markiert", tone: "blue" }
      ]
    }
  },
  {
    slug: "ideensammlung",
    navTitle: "Ideen",
    title: "Ideensammlung",
    eyebrow: "Später ausprobieren",
    summary: "Haltet Dinge fest, die ihr irgendwann ausprobieren wollt, inklusive eigener Bilder.",
    description: [
      "Ideen sind nicht einfach Medien und nicht einfach Termine. Sie sind ein eigener Bereich für Vorhaben, Inspiration und Dinge, die noch reifen dürfen.",
      "Bilder zur Idee bleiben an der Idee und landen nicht automatisch in der normalen Bildergalerie."
    ],
    icon: "Lightbulb",
    highlights: ["Eigene Ideenseite", "Bilder zur Idee", "Likes", "Verknüpfungen optional"],
    walkthrough: [
      "Idee anlegen und kurz beschreiben.",
      "Ein oder mehrere Bilder direkt zur Idee hochladen.",
      "Ausschnitt passend setzen und später bearbeiten.",
      "Wenn aus der Idee ein Termin wird, im Spielplan weiterverwenden."
    ],
    cta: "Ideen sammeln",
    mockup: {
      title: "Ideen",
      subtitle: "Irgendwann",
      primary: "Foto-Session im Studio",
      rows: [
        { label: "Bilder", value: "3", tone: "blue" },
        { label: "Like", value: "Mika", tone: "red" },
        { label: "Status", value: "offen", tone: "neutral" }
      ]
    }
  },
  {
    slug: "packlisten",
    navTitle: "Packlisten",
    title: "Packlisten und Pack-Events",
    eyebrow: "Vorbereitung",
    summary: "Plant Partys oder Events und packt Spielsachen strukturiert ein.",
    description: [
      "Packlisten verbinden Events mit Ausrüstung. Du siehst, was gebraucht wird, was schon eingepackt ist und welche Sachen noch fehlen.",
      "Listen sind nutzerbasiert, teilbar und über API-Endpunkte auch für externe Apps vorbereitet."
    ],
    icon: "Briefcase",
    highlights: ["Pack-Events", "Checkliste", "Verknüpfte Spielsachen", "Teilbar"],
    walkthrough: [
      "Pack-Event anlegen.",
      "Spielsachen aus dem Katalog hinzufügen.",
      "Beim Packen einzelne Punkte abhaken.",
      "Liste teilen oder mit einem Event verknüpfen."
    ],
    cta: "Packliste öffnen",
    mockup: {
      title: "Packliste",
      subtitle: "Party",
      primary: "7 von 10 gepackt",
      rows: [
        { label: "Manschetten", value: "drin", tone: "green" },
        { label: "Augenbinde", value: "fehlt", tone: "red" },
        { label: "Event", value: "Samstag", tone: "blue" }
      ]
    }
  },
  {
    slug: "chat-und-teilen",
    navTitle: "Chat",
    title: "Chat, Teilen und Benachrichtigungen",
    eyebrow: "Kommunikation",
    summary: "Chatte im Kreis, teile Einträge und bekomme Rückmeldung, wenn etwas geöffnet wurde.",
    description: [
      "Der Kreis-Chat ist für echte Unterhaltung gedacht: Nachrichten, später auch App-Push und Medien. Admins können störende Nachrichten unaufdringlich entfernen.",
      "Teilen funktioniert über E-Mail, Telegram und Push. Beim Öffnen wird der ursprüngliche Absender auf demselben Kanal informiert."
    ],
    icon: "MessageCircle",
    highlights: ["Kreis-Chat", "Teilen-Menü", "Öffnungsbestätigung", "Push vorbereitet"],
    walkthrough: [
      "Eintrag öffnen und Teilen antippen.",
      "Kanal wählen: E-Mail, Telegram, Push oder alles.",
      "Zielbenutzer oder Kreis auswählen.",
      "Wenn der Link geöffnet wird, bekommt der Absender eine Rückmeldung."
    ],
    cta: "Chat öffnen",
    mockup: {
      title: "Chat",
      subtitle: "Kreis",
      primary: "Neue Nachricht",
      rows: [
        { label: "Noah", value: "Hallo", tone: "blue" },
        { label: "Push", value: "gesendet", tone: "green" },
        { label: "Teilen", value: "geöffnet", tone: "red" }
      ]
    }
  },
  {
    slug: "telegram-agent",
    navTitle: "Telegram",
    title: "Telegram-Agent",
    eyebrow: "Agent",
    summary: "Der Bot versteht Kontext, beantwortet Fragen und kann Aktionen im Portal ausführen.",
    description: [
      "Telegram ist nicht nur Benachrichtigungskanal. Der Agent kann Dialoge führen, Bilder entgegennehmen, Medien speichern, Items anlegen und Informationen aus dem Portal beantworten.",
      "Bots sind pro Seite, zusätzlich pro Benutzer und auch mehrfach pro Seite konfigurierbar."
    ],
    icon: "Bot",
    highlights: ["Kontextgedächtnis", "Bildverarbeitung", "Aktionsregeln", "Mehrere Bots"],
    walkthrough: [
      "Bot-Token in den Einstellungen hinterlegen.",
      "Webhook setzen und Chat oder Thread aktivieren.",
      "Benutzer zuordnen, damit Rechte stimmen.",
      "Mit Befehlen oder natürlicher Sprache Aktionen auslösen."
    ],
    cta: "Telegram konfigurieren",
    mockup: {
      title: "Telegram",
      subtitle: "Agent",
      primary: "Was ist noch offen?",
      rows: [
        { label: "Antwort", value: "Tracker 2 h", tone: "blue" },
        { label: "Bild", value: "erkannt", tone: "green" },
        { label: "Thread", value: "aktiv", tone: "neutral" }
      ]
    }
  },
  {
    slug: "kreise-und-seiten",
    navTitle: "Kreise",
    title: "Kreise, Seiten und Rechte",
    eyebrow: "Privatsphäre",
    summary: "Mehrere Benutzer teilen Inhalte in Kreisen und Seiten bleiben sauber voneinander getrennt.",
    description: [
      "Kreise sorgen dafür, dass Paare oder vertraute Gruppen automatisch die passenden Inhalte sehen. Seiten trennen Mandanten, Domains, Features und Integrationen.",
      "Admins können Ansichten testen, Benutzer übernehmen und Features pro Seite ein- oder ausschalten."
    ],
    icon: "UsersRound",
    highlights: ["Kreise", "Mandantenfähige Seiten", "Feature-Schalter", "Ansicht wechseln"],
    walkthrough: [
      "Seite oder Kreis anlegen.",
      "Benutzer hinzufügen oder übernehmen.",
      "Features pro Seite aktivieren.",
      "Als Admin Ansicht wechseln und prüfen, was Benutzer sehen."
    ],
    cta: "Einstellungen öffnen",
    mockup: {
      title: "Kreise",
      subtitle: "Seite",
      primary: "Lina und Mika",
      rows: [
        { label: "Feature", value: "Bilder an", tone: "green" },
        { label: "Domain", value: "playplaner", tone: "blue" },
        { label: "Ansicht", value: "testen", tone: "neutral" }
      ]
    }
  },
  {
    slug: "api-und-automation",
    navTitle: "API",
    title: "API, Chronik und externe Automation",
    eyebrow: "Schnittstellen",
    summary: "Steuere die Seite von außen über Bearer Tokens, Cron-Regeln, Push, MQTT-artige Webhooks und App-Endpunkte.",
    description: [
      "Die externe API ist für Apps, Alexa, iobroker und andere Automationen gedacht. Tokens steuern den Zugriff, Endpunkte liefern Status, Bilder, Tracker, Events und Aktionen.",
      "Chronik-Regeln können zeitbasiert externe URLs aufrufen, Push-Nachrichten auslösen oder Kontingente für Sprachansagen bereitstellen."
    ],
    icon: "Workflow",
    highlights: ["Bearer Tokens", "Mobile-App-Endpunkte", "Cron-Regeln", "Externe Pushes"],
    walkthrough: [
      "API-Token unter Einstellungen erzeugen.",
      "Passenden Endpunkt aus der Übersicht kopieren.",
      "Optional Regel mit Uhrzeit und Bedingung anlegen.",
      "Externes System ruft URL auf oder verarbeitet Push-Nutzdaten."
    ],
    cta: "API ansehen",
    mockup: {
      title: "API",
      subtitle: "Automation",
      primary: "GET Kontingent",
      rows: [
        { label: "Alexa", value: "bereit", tone: "blue" },
        { label: "Token", value: "aktiv", tone: "green" },
        { label: "Regel", value: "16:00", tone: "neutral" }
      ]
    }
  }
];

export function featureBySlug(slug: string) {
  return publicFeatures.find((feature) => feature.slug === slug);
}
