export const connectorCatalog = [
  {
    id: "portal.status",
    category: "Portal",
    title: "Portalstatus",
    methods: ["GET"],
    path: "/api/external/status",
    description: "Status der aktuellen Seite inklusive Benutzer, Zählern, laufenden Trackern und Kontingenten."
  },
  {
    id: "portal.capabilities",
    category: "Portal",
    title: "Aktive Fähigkeiten",
    methods: ["GET"],
    path: "/api/external/capabilities",
    description: "Aktive Features, Agentenfähigkeiten, Telegram-Befehle und externe API-Endpunkte."
  },
  {
    id: "portal.points",
    category: "Portal",
    title: "Punkte",
    methods: ["GET"],
    path: "/api/external/points",
    description: "Punktestand, Leaderboard und Punktbuchungen des aktuellen Benutzers."
  },
  {
    id: "play.ready",
    category: "Spielbetrieb",
    title: "Spielampel",
    methods: ["GET", "POST"],
    path: "/api/external/play-ready",
    description: "Ampelstatus lesen oder setzen. Unterstützt state=green|yellow|red|toggle sowie Dauerwerte."
  },
  {
    id: "chat.circles",
    category: "Chat",
    title: "Chat-Zirkel",
    methods: ["GET"],
    path: "/api/external/chat/circles",
    description: "Zugängliche Zirkel mit ungelesenen Nachrichten und letzter Nachricht."
  },
  {
    id: "chat.circle",
    category: "Chat",
    title: "Zirkel-Chat",
    methods: ["GET", "POST"],
    path: "/api/external/chat/circle",
    description: "Chatnachrichten lesen oder senden. circleId ist optional."
  },
  {
    id: "catalog.toys",
    category: "Katalog",
    title: "Spielsachen",
    methods: ["GET", "POST", "PATCH"],
    path: "/api/external/catalog/toys",
    description: "Spielsachen inklusive Kategorien, Bildern, Favoriten und Verknüpfungen lesen oder anlegen."
  },
  {
    id: "catalog.toyDetail",
    category: "Katalog",
    title: "Spielsache Detail",
    methods: ["GET", "PATCH"],
    path: "/api/external/catalog/toys/{id}",
    description: "Spielsache per ID oder Slug lesen oder ändern."
  },
  {
    id: "catalog.positions",
    category: "Katalog",
    title: "Szenen",
    methods: ["GET", "POST"],
    path: "/api/external/catalog/positions",
    description: "Szenen inklusive Kategorien, Bildern, Favoriten, Self-Bondage-Fähigkeit und Verknüpfungen."
  },
  {
    id: "catalog.positionDetail",
    category: "Katalog",
    title: "Szene Detail",
    methods: ["GET", "PATCH"],
    path: "/api/external/catalog/positions/{id}",
    description: "Szene per ID oder Slug lesen oder ändern."
  },
  {
    id: "catalog.categories",
    category: "Katalog",
    title: "Katalog-Kategorien",
    methods: ["GET"],
    path: "/api/external/catalog/categories",
    description: "Kategorien für Spielsachen und Szenen, optional per kind=toy|position gefiltert."
  },
  {
    id: "bondageSystem.products",
    category: "Bondage-System",
    title: "Bondage-System Produkte",
    methods: ["GET"],
    path: "/api/external/bondage-system",
    description: "Freigegebene Shopify-/Bondage-System-Produkte lesen."
  },
  {
    id: "sessions.list",
    category: "Spielplanung",
    title: "Spielplanung",
    methods: ["GET", "POST"],
    path: "/api/external/sessions",
    description: "Spielpläne und Anfragen listen oder anlegen."
  },
  {
    id: "sessions.detail",
    category: "Spielplanung",
    title: "Spielplan Detail",
    methods: ["GET", "PATCH", "DELETE"],
    path: "/api/external/sessions/{id}",
    description: "Spielplan anzeigen, ändern oder löschen/verwerfen."
  },
  {
    id: "orders.list",
    category: "Aufträge",
    title: "Aufträge",
    methods: ["GET", "POST"],
    path: "/api/external/orders",
    description: "Self-Bondage- und andere Aufträge listen oder erteilen."
  },
  {
    id: "orders.detail",
    category: "Aufträge",
    title: "Auftrag Detail",
    methods: ["GET", "PATCH"],
    path: "/api/external/orders/{id}",
    description: "Auftrag anzeigen oder ändern."
  },
  {
    id: "ideas.list",
    category: "Ideen",
    title: "Ideensammlung",
    methods: ["GET", "POST"],
    path: "/api/external/ideas",
    description: "Ideen listen oder neu anlegen."
  },
  {
    id: "ideas.detail",
    category: "Ideen",
    title: "Idee Detail",
    methods: ["GET", "PATCH", "DELETE"],
    path: "/api/external/ideas/{id}",
    description: "Idee anzeigen, ändern oder löschen."
  },
  {
    id: "trackers.history",
    category: "Tracker",
    title: "Tracker-Historie",
    methods: ["GET", "POST"],
    path: "/api/external/trackers/history",
    description: "Tracker-Einträge lesen oder anlegen, inklusive ganztägiger Einträge."
  },
  {
    id: "trackers.quotas",
    category: "Tracker",
    title: "Tracker-Kontingente",
    methods: ["GET"],
    path: "/api/external/trackers/quotas",
    description: "Kontingente und Erfüllungsstand je Tracker abfragen."
  },
  {
    id: "media.feed",
    category: "Bilder",
    title: "Bilder-Feed",
    methods: ["GET", "POST"],
    path: "/api/external/media",
    description: "Geschützten Bilder-/Medienfeed lesen oder Medien hochladen."
  },
  {
    id: "images.feed",
    category: "Bilder",
    title: "Zentraler Bildfeed",
    methods: ["GET"],
    path: "/api/external/images",
    description: "Zentraler Bildfeed für native Apps aus Galerie, Katalog, Ideen und weiteren Bildquellen."
  },
  {
    id: "events.feed",
    category: "Events",
    title: "Ereignisfeed",
    methods: ["GET"],
    path: "/api/external/events",
    description: "Paginierter Eventfeed für Apps und Push-Vorbereitung."
  },
  {
    id: "events.actions",
    category: "Events",
    title: "Ereignis-Aktionen",
    methods: ["GET"],
    path: "/api/external/events/actions",
    description: "Verfügbare Eventtypen mit lesbaren Labels für Filter und Benachrichtigungen."
  },
  {
    id: "wiki.list",
    category: "Wiki",
    title: "Wiki",
    methods: ["GET", "POST"],
    path: "/api/external/wiki",
    description: "Wiki-Seiten des aktuellen Benutzers oder freigegebene Seiten lesen oder anlegen."
  },
  {
    id: "wiki.detail",
    category: "Wiki",
    title: "Wiki-Seite Detail",
    methods: ["GET", "PATCH", "DELETE"],
    path: "/api/external/wiki/{id}",
    description: "Wiki-Seite lesen, ändern oder löschen."
  },
  {
    id: "packing.lists",
    category: "Packlisten",
    title: "Packlisten",
    methods: ["GET", "POST"],
    path: "/api/external/packing/lists",
    description: "Packlisten lesen oder anlegen."
  },
  {
    id: "packing.events",
    category: "Packlisten",
    title: "Packing Events",
    methods: ["GET", "POST"],
    path: "/api/external/packing/events",
    description: "Pack-Events lesen oder anlegen."
  },
  {
    id: "invites",
    category: "Einladungen",
    title: "Einladungen",
    methods: ["GET", "POST"],
    path: "/api/external/invites",
    description: "Einladungen anzeigen oder neue Einladungslinks erzeugen."
  },
  {
    id: "users",
    category: "Admin",
    title: "Benutzer",
    methods: ["GET"],
    path: "/api/external/users",
    description: "Admin-Endpunkt zum Lesen sichtbarer Benutzer."
  },
  {
    id: "tenants",
    category: "Admin",
    title: "Seiten",
    methods: ["GET", "POST"],
    path: "/api/external/tenants",
    description: "Admin-Endpunkt zum Lesen oder Anlegen von Seiten/Mandanten."
  }
];

export function connectorById(id) {
  return connectorCatalog.find((connector) => connector.id === id);
}

export function connectorSummary() {
  const groups = new Map();
  for (const connector of connectorCatalog) {
    const list = groups.get(connector.category) || [];
    list.push(connector);
    groups.set(connector.category, list);
  }
  return [...groups.entries()].map(([category, connectors]) => ({ category, connectors }));
}
