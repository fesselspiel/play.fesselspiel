import { apiEndpointSpecs } from "@/lib/capabilities";

export type RequestMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type ApiNativeToolSource = "manual" | "capability";

export type ApiNativeTool = {
  id: string;
  method: RequestMethod;
  methods?: RequestMethod[];
  path: string;
  title: string;
  description: string;
  category: string;
  source?: ApiNativeToolSource;
  capability?: string;
  action?: string;
};

type ApiEndpointSpec = (typeof apiEndpointSpecs)[number];

const manualToolCatalog = ([
  {
    id: "status",
    method: "GET",
    path: "/api/external/status",
    title: "Portalstatus",
    description: "Status der aktuellen App-Zählstände inkl. laufender Tracker und Quotas.",
    category: "Portal"
  },
  {
    id: "capabilities",
    method: "GET",
    path: "/api/external/capabilities",
    title: "Aktive Fähigkeiten",
    description: "Liefert alle freigeschalteten API-Fähigkeiten inkl. Intents und Aktionen.",
    category: "Portal"
  },
  {
    id: "webSessionBridge",
    method: "POST",
    path: "/api/external/auth/web-session",
    title: "Web-Login-Link",
    description: "Erzeugt aus einem Bearer-Token einen kurzlebigen Web-Session-Link fuer interne Browser.",
    category: "Portal"
  },
  {
    id: "playReady",
    method: "GET",
    methods: ["GET", "POST"],
    path: "/api/external/play-ready",
    title: "Spielampel",
    description: "Lesen und Setzen der Ampel via `state` (`green`, `yellow`, `red`, `toggle`), `expiresMinutes` oder `hours`/`minutes`.",
    category: "Spielbetrieb"
  },
  {
    id: "trackersQuota",
    method: "GET",
    path: "/api/external/trackers/quotas",
    title: "Tracker-Kontingente",
    description: "Abfrage der Kontingente inkl. optionalem TrackerFilter.",
    category: "Tracker"
  },
  {
    id: "trackerStart",
    method: "GET",
    methods: ["GET", "POST"],
    path: "/api/external/trackers/{trackerKey}/start",
    title: "Tracker starten",
    description: "Beliebigen Tracker per trackerKey mit Startparametern anstoßen.",
    category: "Tracker"
  },
  {
    id: "trackerStop",
    method: "GET",
    methods: ["GET", "POST"],
    path: "/api/external/trackers/{trackerKey}/stop",
    title: "Tracker stoppen",
    description: "Laufenden Tracker per trackerKey beenden.",
    category: "Tracker"
  },
  {
    id: "invites",
    method: "GET",
    methods: ["GET", "POST"],
    path: "/api/external/invites",
    title: "Einladungen",
    description: "Usage anzeigen oder Einladungslink per create=1 erzeugen.",
    category: "Einladungen"
  },
  {
    id: "mediaFeed",
    method: "GET",
    path: "/api/external/media",
    title: "Medien-Feed",
    description: "Geschützten Medien-Feed als JSON inklusive Download-URLs.",
    category: "Medien"
  },
  {
    id: "imagesFeed",
    method: "GET",
    path: "/api/external/images",
    title: "Bild-Feed",
    description: "Zentraler Bildfeed für native Apps aus Bildern, Szenen, Ideen, …",
    category: "Medien"
  },
  {
    id: "fileDownload",
    method: "GET",
    path: "/api/external/files/{fileId}",
    title: "Datei-Download",
    description: "Geschützte Datei per Datei-ID nativ laden.",
    category: "Medien"
  },
  {
    id: "sessions",
    method: "GET",
    methods: ["GET", "POST"],
    path: "/api/external/sessions",
    title: "Spielplanung",
    description: "Spielpläne listen oder mit toyIds/positionIds geplant anlegen.",
    category: "Spielbetrieb"
  },
  {
    id: "sessionDetail",
    method: "GET",
    methods: ["GET", "PATCH", "DELETE"],
    path: "/api/external/sessions/{id}",
    title: "Spielplan-Detail",
    description: "Spielplan anzeigen, ändern oder verwerfen.",
    category: "Spielbetrieb"
  },
  {
    id: "ideas",
    method: "GET",
    methods: ["GET", "POST"],
    path: "/api/external/ideas",
    title: "Ideensammlung",
    description: "Ideen listen oder neu anlegen.",
    category: "Ideen"
  },
  {
    id: "ideaDetail",
    method: "GET",
    methods: ["GET", "PATCH", "DELETE"],
    path: "/api/external/ideas/{id}",
    title: "Idee-Detail",
    description: "Idee anzeigen, ändern oder verwerfen.",
    category: "Ideen"
  },
  {
    id: "orders",
    method: "GET",
    methods: ["GET", "POST"],
    path: "/api/external/orders",
    title: "Aufträge",
    description: "Self-Bondage-Aufträge listen oder erteilen.",
    category: "Aufträge"
  },
  {
    id: "orderDetail",
    method: "GET",
    methods: ["GET", "PATCH"],
    path: "/api/external/orders/{id}",
    title: "Auftrag-Detail",
    description: "Auftrag anzeigen oder ändern.",
    category: "Aufträge"
  },
  {
    id: "orderStatus",
    method: "POST",
    methods: ["POST"],
    path: "/api/external/orders/{id}/status",
    title: "Auftrag-Status",
    description: "Auftrag annehmen, umsetzen oder verwerfen per action=accept|complete|cancel.",
    category: "Aufträge"
  },
  {
    id: "bondageSystem",
    method: "GET",
    path: "/api/external/bondage-system",
    title: "Bondage-System",
    description: "Freigegebene Bondage-System-Produkte lesen.",
    category: "Katalog"
  },
  {
    id: "bondageSystemDetail",
    method: "GET",
    path: "/api/external/bondage-system/{id}",
    title: "Bondage-System Detail",
    description: "Bondage-System-Produkt per ID oder Slug lesen.",
    category: "Katalog"
  },
  {
    id: "catalogCategories",
    method: "GET",
    path: "/api/external/catalog/categories",
    title: "Katalog-Kategorien",
    description: "Kategorien fuer Spielsachen und Szenen, optional gefiltert per kind=toy|position.",
    category: "Katalog"
  },
  {
    id: "catalogToys",
    method: "GET",
    path: "/api/external/catalog/toys",
    title: "Spielsachen",
    description: "Spielsachen inklusive Kategorien, Bildern, Favoriten und Verknuepfungen.",
    category: "Katalog"
  },
  {
    id: "catalogToyDetail",
    method: "GET",
    path: "/api/external/catalog/toys/{id}",
    title: "Spielsache Detail",
    description: "Spielsache per ID oder Slug inklusive Bild, Favoriten und Verknuepfungen lesen.",
    category: "Katalog"
  },
  {
    id: "catalogPositions",
    method: "GET",
    path: "/api/external/catalog/positions",
    title: "Szenen",
    description: "Szenen inklusive Kategorien, Bildern, Favoriten, Self-Bondage-Flag und Verknuepfungen.",
    category: "Katalog"
  },
  {
    id: "catalogPositionDetail",
    method: "GET",
    path: "/api/external/catalog/positions/{id}",
    title: "Szene Detail",
    description: "Szene per ID oder Slug inklusive Bild, Favoriten und Verknuepfungen lesen.",
    category: "Katalog"
  },
  {
    id: "eventsFeed",
    method: "GET",
    path: "/api/external/events",
    title: "Ereignisfeed",
    description: "Paginierter Eventfeed fuer native Apps und Push-Vorbereitung.",
    category: "Events"
  },
  {
    id: "eventsActions",
    method: "GET",
    path: "/api/external/events/actions",
    title: "Ereignis-Aktionen",
    description: "Verfuegbare Eventtypen mit lesbaren Labels fuer App-Filter und Push-Kategorien.",
    category: "Events"
  },
  {
    id: "mediaUpload",
    method: "POST",
    methods: ["POST"],
    path: "/api/external/media",
    title: "Upload",
    description: "Bild/Video hochladen per Multipart inkl. optionaler Sichtbarkeit.",
    category: "Medien"
  }
] satisfies Omit<ApiNativeTool, "source">[]).map((tool): ApiNativeTool => ({ ...tool, source: "manual" }));

function makeToolIdFromSpec(spec: ApiEndpointSpec, index: number) {
  const pathSlug = spec.path
    .toLowerCase()
    .replace(/\{[^}]+\}/g, "param")
    .replace(/\//g, "-")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const actionSlug = (spec.action || "request").toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");
  return `cap-${spec.method.toLowerCase()}-${pathSlug}-${actionSlug}-${index}`;
}

function buildCapabilityTools() {
  const manualSignatures = new Set(
    manualToolCatalog.flatMap((tool) => {
      const supportedMethods = tool.methods?.length ? tool.methods : [tool.method];
      return supportedMethods.map((method) => `${method}:${tool.path.split("?")[0]}`);
    })
  );
  return apiEndpointSpecs
    .map((spec, index) => ({
      id: makeToolIdFromSpec(spec, index),
      method: spec.method,
      path: spec.path,
      title: `${spec.capability}: ${spec.action}`,
      description: spec.description,
      category: spec.capability || "Externe API",
      source: "capability" as const,
      capability: spec.capability,
      action: spec.action
    }))
    .filter((tool) => !manualSignatures.has(`${tool.method}:${tool.path.split("?")[0]}`));
}

export const apiNativeToolCatalog: ApiNativeTool[] = [...manualToolCatalog, ...buildCapabilityTools()];
