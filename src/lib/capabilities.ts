import type OpenAI from "openai";

export type CapabilityActionType = "read" | "write" | "delete" | "admin";

export type CapabilityAction = {
  key: string;
  label: string;
  type: CapabilityActionType;
  description: string;
  agentTool?: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    directResult?: boolean;
  };
  telegramCommands?: {
    command: string;
    description: string;
    aliases?: string[];
    hidden?: boolean;
  }[];
  apiEndpoints?: {
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    path: string;
    description: string;
  }[];
  auditActions?: string[];
};

export type Capability = {
  key: string;
  label: string;
  featureKey: string;
  aliases: string[];
  intents: string[];
  route?: string;
  actions: CapabilityAction[];
};

export const capabilities: readonly Capability[] = [
  {
    key: "portal",
    label: "Start und Portalstatus",
    featureKey: "portal",
    aliases: ["start", "dashboard", "status", "uebersicht"],
    intents: ["status", "uebersicht", "was ist los", "portal"],
    route: "/",
    actions: [
      {
        key: "status",
        label: "Status anzeigen",
        type: "read",
        description: "Kompakte Übersicht über Zähler, offene Tracker und Grunddaten.",
        agentTool: {
          name: "get_portal_status",
          description: "Zeigt eine kompakte Übersicht über das Portal des aktiven Benutzers.",
          directResult: true,
          parameters: { type: "object", properties: {}, additionalProperties: false }
        },
        telegramCommands: [
          { command: "/start", description: "Bot starten" },
          { command: "/help", description: "Befehle anzeigen" },
          { command: "/id", description: "Chat-ID und Thread-ID anzeigen" },
          { command: "/status", description: "kurze Übersicht" }
        ],
        apiEndpoints: [
          { method: "GET", path: "/api/external/status?token=...", description: "Status, Benutzer und Grunddaten prüfen." },
          { method: "GET", path: "/api/external/capabilities?token=...", description: "Aktive Fähigkeiten, Befehle und externe Endpunkte der aktuellen Seite abfragen." }
        ],
        auditActions: ["login", "logout", "portal_status_requested"]
      },
      {
        key: "search",
        label: "Portal durchsuchen",
        type: "read",
        description: "Sucht über Spielzeuge, Szenen, Spielpläne und Tracker-Einträge.",
        agentTool: {
          name: "search_portal",
          description: "Sucht Spielzeuge, Szenen, Aktivitäten und Sessions im Portal.",
          directResult: true,
          parameters: {
            type: "object",
            properties: {
              query: { type: "string", description: "Suchtext. Leer lassen für aktuelle Listen." },
              area: { type: "string", enum: ["all", "toys", "positions", "activities", "sessions"] }
            },
            required: ["query", "area"],
            additionalProperties: false
          }
        }
      }
    ]
  },
  {
    key: "playReady",
    label: "Spielampel",
    featureKey: "playReady",
    aliases: ["ampel", "lust", "bereit"],
    intents: ["ampel setzen", "spielbereit", "luststatus"],
    route: "/settings/play-ready",
    actions: [
      {
        key: "read",
        label: "Ampel anzeigen",
        type: "read",
        description: "Liest den aktuellen Ampelstatus.",
        apiEndpoints: [
          { method: "GET", path: "/api/external/play-ready?token=...", description: "Aktuellen Spielampelstatus abfragen." }
        ],
        auditActions: ["play_ready_viewed"]
      },
      {
        key: "set",
        label: "Ampel setzen",
        type: "write",
        description: "Setzt Rot, Grün oder schaltet den Zustand um.",
        apiEndpoints: [
          { method: "GET", path: "/api/external/play-ready?token=...&state=green&hours=2&minutes=15", description: "Spielampel setzen. `state` kann green, red oder toggle sein; Dauer maximal 12 Stunden." },
          { method: "POST", path: "/api/external/play-ready", description: "Spielampel über JSON oder Form-Daten setzen. Unterstützt `state`, `expiresMinutes` oder `hours`/`minutes`." }
        ],
        auditActions: ["play_ready_changed", "play_ready_expired"]
      }
    ]
  },
  {
    key: "toys",
    label: "Spielsachen",
    featureKey: "toys",
    aliases: ["spielzeug", "spielzeuge", "spielsachen", "toy", "toys"],
    intents: ["spielzeug anlegen", "spielzeuge anzeigen", "lieblingsspielzeug"],
    route: "/toys",
    actions: [
      {
        key: "list",
        label: "Spielsachen anzeigen",
        type: "read",
        description: "Listet Spielsachen und ihre Detailseiten.",
        telegramCommands: [{ command: "/toys", description: "Spielzeuge anzeigen" }]
      },
      {
        key: "favorite",
        label: "Favoriten anzeigen",
        type: "read",
        description: "Listet favorisierte Spielsachen und Szenen eines Benutzers.",
        agentTool: {
          name: "get_favorites",
          description: "Listet Favoriten eines Benutzers. Verwenden bei Fragen nach Favoriten, Lieblingsspielzeugen, Lieblingsszenen oder 'was sind die Favoriten von ...'.",
          directResult: true,
          parameters: {
            type: "object",
            properties: {
              targetName: { type: "string", description: "Optionaler Benutzername oder Anzeigename, z.B. Gabriel. Leer lassen für den aktiven Benutzer." },
              area: { type: "string", enum: ["all", "toys", "positions"], description: "Welche Favoriten angezeigt werden sollen." }
            },
            required: ["targetName", "area"],
            additionalProperties: false
          }
        },
        telegramCommands: [{ command: "/favoriten Name", description: "Favoriten anzeigen", aliases: ["/favorites Name"] }],
        auditActions: ["toy_favorited", "toy_unfavorited"]
      },
      {
        key: "create",
        label: "Spielzeug anlegen",
        type: "write",
        description: "Legt ein Spielzeug im Katalog an.",
        agentTool: {
          name: "create_toy",
          description: "Legt ein Spielzeug im Spielzeugkatalog an.",
          parameters: {
            type: "object",
            properties: {
              title: { type: "string" },
              description: { type: "string" },
              imageUrl: { type: "string" },
              slug: { type: "string" }
            },
            required: ["title", "description", "imageUrl"],
            additionalProperties: false
          }
        },
        telegramCommands: [{ command: "/toy_new Name", description: "neues Spielzeug mit Dialog anlegen" }],
        auditActions: ["toy_created", "toy_updated", "toy_deleted"]
      },
      {
        key: "update",
        label: "Spielzeug ändern",
        type: "write",
        description: "Ändert Titel, Beschreibung oder Bild eines vorhandenen Spielzeugs.",
        agentTool: {
          name: "update_toy",
          description: "Ändert ein vorhandenes Spielzeug. Verwenden, wenn der Nutzer Titel, Beschreibung oder Bild eines bestehenden Spielzeugs ändern möchte. Nicht zum Neuanlegen verwenden.",
          parameters: {
            type: "object",
            properties: {
              titleOrSlug: { type: "string", description: "Aktueller Titel oder Slug des Spielzeugs, das geändert werden soll." },
              title: { type: "string", description: "Neuer Titel, falls er geändert werden soll." },
              description: { type: "string", description: "Neue Beschreibung, falls sie geändert werden soll." },
              imageUrl: { type: "string", description: "Neue Bild-URL, falls das Bild geändert werden soll." },
              intent: { type: "string", description: "Kurze Beschreibung der Absicht, z.B. Bild ersetzen oder Beschreibung ändern." },
              change: { type: "string", description: "Welche Art Änderung gewünscht ist." }
            },
            required: ["titleOrSlug"],
            additionalProperties: false
          }
        },
        auditActions: ["toy_updated"]
      }
    ]
  },
  {
    key: "positions",
    label: "Szenen",
    featureKey: "positions",
    aliases: ["stellung", "stellungen", "szene", "szenen", "positionen"],
    intents: ["szene anlegen", "szenen anzeigen", "self-bondage-faehig"],
    route: "/positions",
    actions: [
      {
        key: "list",
        label: "Szenen anzeigen",
        type: "read",
        description: "Listet Szenen und verknüpfte Spielsachen.",
        telegramCommands: [{ command: "/positions", description: "Szenen anzeigen" }]
      },
      {
        key: "create",
        label: "Szene anlegen",
        type: "write",
        description: "Legt eine Szene an und kann vorhandene Spielzeuge verknüpfen.",
        agentTool: {
          name: "create_position",
          description: "Legt eine Szene/Position an und kann vorhandene Spielzeuge per Titel verknüpfen.",
          parameters: {
            type: "object",
            properties: {
              name: { type: "string" },
              description: { type: "string" },
              imageUrl: { type: "string" },
              toyTitles: { type: "array", items: { type: "string" } }
            },
            required: ["name", "description", "imageUrl"],
            additionalProperties: false
          }
        },
        auditActions: ["position_created", "position_updated", "position_deleted", "position_favorited", "position_unfavorited"]
      }
    ]
  },
  {
    key: "activities",
    label: "Spielplanung",
    featureKey: "activities",
    aliases: ["spielplan", "aktivitaeten", "lass uns spielen"],
    intents: ["spiel anfragen", "spielplan bestaetigen", "termin planen"],
    route: "/activities",
    actions: [
      {
        key: "list",
        label: "Spielpläne anzeigen",
        type: "read",
        description: "Listet geplante und angefragte Spielpläne.",
        telegramCommands: [
          { command: "/activities", description: "geplante Aktivitäten anzeigen" },
          { command: "/activity_confirm_1", description: "angefragten Spielplan aus der Liste bestätigen" }
        ]
      },
      {
        key: "create",
        label: "Spielplan anlegen",
        type: "write",
        description: "Plant eine Aktivität mit Datum, Notiz, Spielsachen und Szenen.",
        agentTool: {
          name: "create_activity",
          description: "Plant eine Aktivität mit optionalem Datum, Notiz, Spielzeugen und Szenen.",
          parameters: {
            type: "object",
            properties: {
              title: { type: "string" },
              category: { type: "string" },
              note: { type: "string" },
              plannedAt: { type: "string", description: "ISO-8601 Datum/Zeit oder leer, z.B. 2026-06-18T20:00:00+02:00" },
              status: { type: "string", enum: ["REQUESTED", "PLANNED"] },
              toyTitles: { type: "array", items: { type: "string" } },
              positionNames: { type: "array", items: { type: "string" } }
            },
            required: ["title"],
            additionalProperties: false
          }
        },
        telegramCommands: [{ command: "/activity_request Titel", description: "Spielplan anfragen" }],
        auditActions: ["activity_created", "activity_requested", "activity_requested_telegram"]
      },
      {
        key: "status",
        label: "Spielplanstatus ändern",
        type: "write",
        description: "Setzt eine Aktivität auf angefragt, geplant, durchgeführt oder verworfen.",
        agentTool: {
          name: "set_activity_status",
          description: "Setzt eine vorhandene Aktivität auf angefragt, geplant, durchgeführt oder verworfen. Zum Bestätigen einer Anfrage auf PLANNED setzen.",
          parameters: {
            type: "object",
            properties: {
              titleOrSlug: { type: "string" },
              status: { type: "string", enum: ["REQUESTED", "PLANNED", "DONE", "DISCARDED"] }
            },
            required: ["titleOrSlug", "status"],
            additionalProperties: false
          }
        },
        auditActions: ["activity_confirmed", "activity_confirmed_telegram", "activity_updated"]
      }
    ]
  },
  {
    key: "orders",
    label: "Aufträge",
    featureKey: "orders",
    aliases: ["auftrag", "auftraege", "self-bondage-auftrag"],
    intents: ["auftrag anzeigen", "auftrag annehmen", "auftrag erledigen"],
    route: "/orders",
    actions: [
      {
        key: "list",
        label: "Aufträge anzeigen",
        type: "read",
        description: "Listet offene und angenommene Self-Bondage-Aufträge.",
        telegramCommands: [
          { command: "/orders", description: "offene Self-Bondage-Aufträge anzeigen" },
          { command: "/order_accept_1", description: "Auftrag aus der Liste annehmen" },
          { command: "/order_done_1", description: "Auftrag aus der Liste als umgesetzt speichern" }
        ],
        auditActions: ["self_bondage_order_requested", "self_bondage_order_accepted", "self_bondage_order_completed"]
      }
    ]
  },
  {
    key: "trackers",
    label: "Tracker",
    featureKey: "trackers",
    aliases: ["session", "sessions", "tracker", "kontingent", "quota"],
    intents: ["tracker starten", "tracker stoppen", "kontingent abfragen", "restzeit"],
    route: "/sessions",
    actions: [
      {
        key: "quotas",
        label: "Kontingente anzeigen",
        type: "read",
        description: "Liest Tracker-Kontingente, Restzeiten und offene Todos.",
        agentTool: {
          name: "get_tracker_quotas",
          description: "Liest Tracker-Kontingente, Restzeiten, offene Todos und bereits erfüllte Zeiten. Verwenden bei Fragen wie: Rest-Kontingent, wie viel ist noch übrig, wie viel muss ich heute/diese Woche/diesen Monat noch machen, Tracker-Todo, Sollzeit.",
          directResult: true,
          parameters: {
            type: "object",
            properties: {
              trackerKeyOrTitle: { type: "string", description: "Optionaler Tracker, z.B. Segufix, KG oder technischer Schlüssel." },
              period: { type: "string", enum: ["all", "daily", "weekly", "monthly"], description: "Gefragter Zeitraum. all, wenn unklar." }
            },
            required: ["trackerKeyOrTitle", "period"],
            additionalProperties: false
          }
        },
        telegramCommands: [{ command: "/kontingent", description: "Tracker-Kontingente und offene Todos anzeigen", aliases: ["/quota", "/quotas"] }],
        apiEndpoints: [
          { method: "GET", path: "/api/external/trackers/quotas?token=...", description: "Kontingente und offene Tracker-Todos abfragen." },
          { method: "GET", path: "/api/external/trackers/quotas?token=...&trackerKey=segufix", description: "Kontingent eines bestimmten Trackers abfragen, z. B. für Alexa." }
        ],
        auditActions: ["tracker_quota_viewed"]
      },
      {
        key: "start",
        label: "Tracker starten",
        type: "write",
        description: "Startet einen beliebigen Tracker per Schlüssel.",
        apiEndpoints: [
          { method: "GET", path: "/api/external/trackers/{trackerKey}/start?token=...&note=...&startTime=...", description: "Beliebigen Tracker starten, z. B. trackerKey=segufix oder kg." },
          { method: "GET", path: "/api/external/trackers/{trackerKey}/start?token=...&allDay=true&date=2026-06-24&note=...", description: "Ganztägigen Tracker-Eintrag ohne Start-/Endzeit anlegen." },
          { method: "POST", path: "/api/external/trackers/{trackerKey}/start", description: "Per POST denselben Startvorgang auslösen; Parameter im Body oder als Form-Daten." }
        ],
        auditActions: ["tracker_started", "tracker_segufix_started_telegram", "tracker_kg_started_telegram"]
      },
      {
        key: "stop",
        label: "Tracker beenden",
        type: "write",
        description: "Beendet einen laufenden Tracker.",
        apiEndpoints: [
          { method: "GET", path: "/api/external/trackers/{trackerKey}/stop?token=...&note=...", description: "Beliebigen laufenden Tracker beenden." },
          { method: "POST", path: "/api/external/trackers/{trackerKey}/stop", description: "Beliebigen laufenden Tracker per POST beenden; `note` optional im Body." }
        ],
        auditActions: ["tracker_stopped", "tracker_segufix_stopped_telegram", "tracker_kg_stopped_telegram"]
      }
    ]
  },
  {
    key: "tracker.segufix",
    label: "Segufix Time Tracker",
    featureKey: "tracker.segufix",
    aliases: ["segufix", "segufix session", "session"],
    intents: ["segufix starten", "segufix stoppen", "session starten", "session beenden"],
    route: "/sessions/segufix",
    actions: [
      {
        key: "overview",
        label: "Segufix anzeigen",
        type: "read",
        description: "Zeigt Segufix-Auswertung und Kontingent.",
        telegramCommands: [{ command: "/sessions", description: "Session-Auswertung aktuelles Jahr" }]
      },
      {
        key: "start",
        label: "Segufix starten",
        type: "write",
        description: "Startet eine Segufix-Session.",
        agentTool: {
          name: "start_session",
          description: "Startet eine Segufix-Session, wenn keine andere Session offen ist.",
          parameters: {
            type: "object",
            properties: {
              note: { type: "string" },
              moodBefore: { type: "string", enum: ["NEEDS_WORK", "OKAY", "NEUTRAL", "PLEASANT", "VERY_PLEASANT"] }
            },
            additionalProperties: false
          }
        },
        telegramCommands: [{ command: "/session_start Notiz", description: "Segufix-Session starten" }]
      },
      {
        key: "stop",
        label: "Segufix beenden",
        type: "write",
        description: "Beendet die laufende Segufix-Session.",
        agentTool: {
          name: "stop_session",
          description: "Beendet die aktuell laufende Segufix-Session.",
          parameters: {
            type: "object",
            properties: {
              note: { type: "string" },
              moodAfter: { type: "string", enum: ["WORSE", "UNCHANGED", "SLIGHTLY_BETTER", "MUCH_BETTER", "RELAXED"] }
            },
            additionalProperties: false
          }
        },
        telegramCommands: [{ command: "/session_stop Notiz", description: "laufende Session beenden" }]
      }
    ]
  },
  {
    key: "tracker.kg",
    label: "KG Time Tracker",
    featureKey: "tracker.kg",
    aliases: ["kg", "kg tracker", "kg time tracker"],
    intents: ["kg starten", "kg stoppen", "kg kontingent"],
    route: "/sessions/kg",
    actions: [
      {
        key: "overview",
        label: "KG anzeigen",
        type: "read",
        description: "Zeigt KG-Auswertung und Kontingent.",
        telegramCommands: [{ command: "/kg", description: "KG-Auswertung aktuelles Jahr" }]
      },
      {
        key: "start",
        label: "KG starten",
        type: "write",
        description: "Startet den KG Time Tracker.",
        agentTool: {
          name: "start_kg_tracker",
          description: "Startet den KG Time Tracker. Wenn bereits einer offen ist, wird er beendet und ein neuer gestartet.",
          parameters: {
            type: "object",
            properties: { note: { type: "string" } },
            additionalProperties: false
          }
        },
        telegramCommands: [{ command: "/kg_start Notiz", description: "KG-Tracker starten" }]
      },
      {
        key: "stop",
        label: "KG beenden",
        type: "write",
        description: "Beendet den aktuell laufenden KG Time Tracker.",
        agentTool: {
          name: "stop_kg_tracker",
          description: "Beendet den aktuell laufenden KG Time Tracker.",
          parameters: {
            type: "object",
            properties: { note: { type: "string" } },
            additionalProperties: false
          }
        },
        telegramCommands: [{ command: "/kg_stop Notiz", description: "KG-Tracker beenden" }]
      }
    ]
  },
  {
    key: "media",
    label: "Bilder",
    featureKey: "media",
    aliases: ["bilder", "medien", "album", "alben", "foto"],
    intents: ["bild hochladen", "album anlegen", "bild einsortieren"],
    route: "/media",
    actions: [
      {
        key: "upload",
        label: "Bild hochladen",
        type: "write",
        description: "Lädt ein geschütztes Bild oder Video hoch.",
        apiEndpoints: [
          { method: "GET", path: "/api/external/images?token=...&source=all&limit=100", description: "Zentraler Bildfeed über Galerie, Spielsachen, Szenen, Ideen, Bondage-System und Profilbilder. Per `source` filterbar." },
          { method: "GET", path: "/api/external/images?token=...&source=toys", description: "Bilder aus dem Spielzeugkatalog für native externe App-Anzeige abrufen." },
          { method: "GET", path: "/api/external/images?token=...&source=positions", description: "Szenen-/Situationsbilder für native externe App-Anzeige abrufen." },
          { method: "GET", path: "/api/external/images?token=...&source=ideas", description: "Ideenbilder für native externe App-Anzeige abrufen." },
          { method: "GET", path: "/api/external/images?token=...&source=bondageSystem", description: "Bondage-System-Produktbilder für native externe App-Anzeige abrufen." },
          { method: "GET", path: "/api/external/media?token=...&kind=IMAGE&limit=50", description: "Geschützte Bilder als JSON-Feed für externe Apps abrufen. Antwort enthält `downloadUrl` für native Bildanzeige." },
          { method: "GET", path: "/api/external/files/{fileId}?token=...", description: "Geschützte Bild-/Videodatei nativ laden. Alternativ Bearer Token im Authorization-Header verwenden." },
          { method: "POST", path: "/api/external/media", description: "Bild/Video per Multipart hochladen. Token im Header oder als Feld `token`." }
        ],
        auditActions: ["media_uploaded", "media_updated", "media_deleted", "media_album_changed_telegram"]
      },
      {
        key: "album",
        label: "Album anlegen",
        type: "write",
        description: "Legt ein neues Album an.",
        telegramCommands: [{ command: "/album_new Name", description: "neues Album anlegen" }],
        auditActions: ["album_created", "album_updated", "album_deleted"]
      }
    ]
  },
  {
    key: "invites",
    label: "Einladungen",
    featureKey: "invites",
    aliases: ["invite", "einladung", "einladungen"],
    intents: ["einladung erstellen", "einladung versenden", "invite kontingent"],
    route: "/settings/invites",
    actions: [
      {
        key: "list",
        label: "Einladungen anzeigen",
        type: "read",
        description: "Zeigt Einladungskontingent und vorhandene Einladungen.",
        telegramCommands: [{ command: "/invites", description: "Einladungskontingent anzeigen" }],
        apiEndpoints: [{ method: "GET", path: "/api/external/invites?token=...", description: "Einladungskontingent abfragen." }]
      },
      {
        key: "create",
        label: "Einladung erzeugen",
        type: "write",
        description: "Erzeugt einen Einladungslink.",
        telegramCommands: [{ command: "/invite Name", description: "Einladungslink erzeugen" }],
        apiEndpoints: [
          { method: "GET", path: "/api/external/invites?token=...&create=1&name=Anna&email=...", description: "Einladungslink erzeugen; Admins haben unbegrenzt Einladungen." },
          { method: "POST", path: "/api/external/invites?name=Anna&email=...", description: "Einladung auch per POST erstellen; `name` und `email` im Body oder als Form-Daten." }
        ],
        auditActions: ["invite_created", "invite_resent", "invite_deleted", "invite_accepted"]
      }
    ]
  },
  {
    key: "ideas",
    label: "Ideensammlung",
    featureKey: "ideas",
    aliases: ["idee", "ideen", "bucketlist"],
    intents: ["idee anlegen", "ideen anzeigen", "idee kommentieren"],
    route: "/ideas",
    actions: [
      {
        key: "manage",
        label: "Ideen verwalten",
        type: "write",
        description: "Sammelt Dinge, die später ausprobiert werden sollen.",
        auditActions: ["idea_created", "idea_updated", "idea_deleted", "idea_image_uploaded", "idea_liked", "idea_unliked"]
      }
    ]
  },
  {
    key: "shopifyBondageSystem",
    label: "Bondage-System",
    featureKey: "shopifyBondageSystem",
    aliases: ["shopify", "bondage-system", "produkte"],
    intents: ["shopify synchronisieren", "produkte anzeigen", "bondage system"],
    route: "/bondage-system",
    actions: [
      {
        key: "sync",
        label: "Shopify synchronisieren",
        type: "admin",
        description: "Synchronisiert ausgewählte Shopify-Produkte als Bondage-System-Spielsachen.",
        auditActions: ["shopify_sync_started", "shopify_sync_finished", "shopify_product_enabled"]
      }
    ]
  },
  {
    key: "telegram",
    label: "Telegram",
    featureKey: "telegram",
    aliases: ["telegram", "bot", "bot token"],
    intents: ["telegram konfigurieren", "telegram nachricht", "bot einstellen"],
    route: "/settings/telegram",
    actions: [
      {
        key: "configure",
        label: "Telegram konfigurieren",
        type: "admin",
        description: "Konfiguriert Bots, Chats, Threads, Benutzerzuordnung und Versandregeln.",
        auditActions: ["telegram_message_received", "telegram_message_sent", "telegram_chat_detected", "telegram_chat_activated", "telegram_user_mapped"]
      }
    ]
  },
  {
    key: "email",
    label: "E-Mail",
    featureKey: "email",
    aliases: ["mail", "email", "postfix"],
    intents: ["email senden", "template konfigurieren", "mail log"],
    route: "/settings/email",
    actions: [
      {
        key: "configure",
        label: "E-Mail konfigurieren",
        type: "admin",
        description: "Konfiguriert Templates, Versandregeln und Versandprotokoll.",
        auditActions: ["email_sent", "email_failed", "email_template_updated", "email_rule_triggered"]
      }
    ]
  },
  {
    key: "externalApi",
    label: "Externe API",
    featureKey: "externalApi",
    aliases: ["api", "token", "alexa", "webhook"],
    intents: ["api token", "externer aufruf", "alexa"],
    route: "/settings/api",
    actions: [
      {
        key: "tokens",
        label: "API Tokens verwalten",
        type: "admin",
        description: "Erzeugt und deaktiviert externe API Tokens.",
        auditActions: ["api_token_created", "api_token_revoked", "api_token_used"]
      }
    ]
  },
  {
    key: "scheduledRules",
    label: "Zeitregeln",
    featureKey: "scheduledRules",
    aliases: ["cron", "zeitregel", "scheduler", "geplante url"],
    intents: ["zeitregel anlegen", "url zeitgesteuert aufrufen", "cronjob"],
    route: "/settings/scheduled",
    actions: [
      {
        key: "manage",
        label: "Zeitregeln verwalten",
        type: "write",
        description: "Ruft zu konfigurierten Zeiten URLs auf oder löst Aktionen aus, wenn Bedingungen erfüllt sind.",
        auditActions: ["scheduled_rule_created", "scheduled_rule_updated", "scheduled_rule_deleted", "scheduled_rule_executed", "scheduled_rule_skipped", "scheduled_rule_failed"]
      }
    ]
  },
  {
    key: "auditLog",
    label: "Protokoll",
    featureKey: "auditLog",
    aliases: ["protokoll", "log", "chronik", "feed"],
    intents: ["protokoll durchsuchen", "feed steuern", "aktion anzeigen"],
    route: "/settings/log",
    actions: [
      {
        key: "read",
        label: "Protokoll anzeigen",
        type: "read",
        description: "Zeigt protokollierte Aktionen mit Filtern, Feed-Freigabe und Debug-Details."
      }
    ]
  },
  {
    key: "dataTransfer",
    label: "Datenexport und Import",
    featureKey: "dataTransfer",
    aliases: ["export", "import", "backup"],
    intents: ["daten exportieren", "daten importieren"],
    route: "/settings/data",
    actions: [
      {
        key: "transfer",
        label: "Daten übertragen",
        type: "admin",
        description: "Exportiert und importiert Daten inklusive geschützter Dateien."
      }
    ]
  }
] as const;

const capabilityLabelByFeature = new Map(capabilities.map((capability) => [capability.featureKey, capability.label]));

export const featureCatalog = [
  { key: "positions", label: capabilityLabelByFeature.get("positions") || "Szenen" },
  { key: "toys", label: capabilityLabelByFeature.get("toys") || "Spielsachen" },
  { key: "shopifyBondageSystem", label: capabilityLabelByFeature.get("shopifyBondageSystem") || "Bondage-System" },
  { key: "ideas", label: capabilityLabelByFeature.get("ideas") || "Ideensammlung" },
  { key: "playReady", label: capabilityLabelByFeature.get("playReady") || "Spielampel" },
  { key: "invites", label: capabilityLabelByFeature.get("invites") || "Einladungen" },
  { key: "media", label: capabilityLabelByFeature.get("media") || "Bilder" },
  { key: "activities", label: capabilityLabelByFeature.get("activities") || "Spielplanung" },
  { key: "orders", label: capabilityLabelByFeature.get("orders") || "Aufträge" },
  { key: "selfBondage", label: "Self-Bondage" },
  { key: "trackers", label: capabilityLabelByFeature.get("trackers") || "Tracker" },
  { key: "tracker.segufix", label: capabilityLabelByFeature.get("tracker.segufix") || "Segufix Time Tracker" },
  { key: "tracker.kg", label: capabilityLabelByFeature.get("tracker.kg") || "KG Time Tracker" },
  { key: "telegram", label: capabilityLabelByFeature.get("telegram") || "Telegram" },
  { key: "externalApi", label: capabilityLabelByFeature.get("externalApi") || "Externe API" },
  { key: "scheduledRules", label: capabilityLabelByFeature.get("scheduledRules") || "Zeitregeln" },
  { key: "email", label: capabilityLabelByFeature.get("email") || "E-Mail" },
  { key: "dataTransfer", label: capabilityLabelByFeature.get("dataTransfer") || "Datenexport und Import" },
  { key: "auditLog", label: capabilityLabelByFeature.get("auditLog") || "Protokoll" }
] as const;

export type CapabilityFeatureKey = typeof featureCatalog[number]["key"];

export const agentTools = capabilities.flatMap((capability) =>
  capability.actions.flatMap((action) =>
    action.agentTool
      ? [{
          type: "function",
          function: {
            name: action.agentTool.name,
            description: action.agentTool.description,
            parameters: action.agentTool.parameters
          }
        } satisfies OpenAI.Chat.Completions.ChatCompletionTool]
      : []
  )
);

export const directAgentToolNames = new Set(
  capabilities.flatMap((capability) => capability.actions.flatMap((action) => action.agentTool?.directResult ? [action.agentTool.name] : []))
);

export const apiEndpointSpecs = capabilities.flatMap((capability) =>
  capability.actions.flatMap((action) => action.apiEndpoints?.map((endpoint) => ({ ...endpoint, capability: capability.label, action: action.label })) || [])
);

export const apiVariableNames = ["token", "trackerKey", "fileId", "albumId", "kind", "limit", "cursor", "q", "note", "title", "startTime", "date", "allDay", "state", "hours", "minutes", "expiresMinutes", "name", "email"];

export const telegramCommandSpecs = capabilities.flatMap((capability) =>
  capability.actions.flatMap((action) =>
    action.telegramCommands
      ?.filter((command) => !command.hidden)
      .map((command) => ({
        ...command,
        capability: capability.label,
        action: action.label
      })) || []
  )
);

export function buildTelegramHelpText() {
  const commandLines = telegramCommandSpecs.map((entry) => `${entry.command} - ${entry.description}`);
  return [
    "<b>Befehle</b>",
    ...commandLines,
    "",
    "<b>Du kannst auch normal schreiben</b>",
    "Plane morgen um 20 Uhr einen Entspannungsabend mit Leder-Manschetten.",
    "Welche Spielzeuge habe ich?",
    "Starte eine Session mit Notiz ruhig begonnen.",
    "Wie viel Kontingent ist heute noch offen?",
    "Welche Favoriten hat Gabriel?"
  ].join("\n");
}

export function agentCapabilityPrompt() {
  const readable = capabilities
    .filter((capability) => capability.actions.some((action) => action.agentTool))
    .map((capability) => `${capability.label}: ${capability.intents.join(", ")}`)
    .join("; ");
  return [
    `Verfügbare Portal-Fähigkeiten: ${readable}.`,
    "Nutze bei passenden Nutzerfragen die bereitgestellten Tools statt frei zu raten.",
    "Bei Fragen zu Tracker-Kontingenten, Restzeit, Sollzeit, Todo, 'noch übrig' oder 'noch zu machen' musst du get_tracker_quotas verwenden.",
    "Bei Fragen nach Favoriten, Lieblingsspielzeugen oder Lieblingsszenen musst du get_favorites verwenden, nicht search_portal."
  ].join(" ");
}

export function publicCapabilitySummary(features: { key: string; enabled: boolean }[] | undefined, enabled: (features: { key: string; enabled: boolean }[] | undefined, key: string) => boolean) {
  return capabilities
    .filter((capability) => capability.featureKey === "portal" || enabled(features, capability.featureKey))
    .map((capability) => ({
      key: capability.key,
      label: capability.label,
      featureKey: capability.featureKey,
      aliases: capability.aliases,
      intents: capability.intents,
      route: capability.route,
      actions: capability.actions.map((action) => ({
        key: action.key,
        label: action.label,
        type: action.type,
        description: action.description,
        agentTool: action.agentTool?.name,
        telegramCommands: action.telegramCommands?.filter((command) => !command.hidden),
        apiEndpoints: action.apiEndpoints,
        auditActions: action.auditActions
      }))
    }));
}
