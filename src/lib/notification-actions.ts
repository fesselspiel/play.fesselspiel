import { prisma } from "@/lib/prisma";

const legacyAuditActionPrefixes = [
  "kg_",
  "session_",
  "tracker_kg_",
  "tracker_segufix_"
];

export const knownAuditActions = [
  ["activity_confirmed", "Spielplan bestätigt"],
  ["activity_created", "Spielplan angelegt"],
  ["activity_confirmed_telegram", "Spielplan per Telegram bestätigt"],
  ["activity_requested", "Spielplan angefragt"],
  ["activity_requested_telegram", "Spielplan per Telegram angefragt"],
  ["api_mobile_login", "App-Login"],
  ["api_mobile_login_failed", "App-Login fehlgeschlagen"],
  ["api_web_session_link_created", "App-Web-Login-Link erzeugt"],
  ["api_web_session_login", "App-Web-Login"],
  ["album_created", "Album angelegt"],
  ["album_deleted", "Album gelöscht"],
  ["album_updated", "Album geändert"],
  ["circle_chat_message_created", "Chat-Nachricht gesendet"],
  ["circle_chat_message_created_api", "Chat-Nachricht per API gesendet"],
  ["circle_chat_message_deleted", "Chat-Nachricht gelöscht"],
  ["circle_chat_message_deleted_api", "Chat-Nachricht per API gelöscht"],
  ["circle_chat_viewed", "Chat geöffnet"],
  ["idea_created", "Idee festgehalten"],
  ["idea_liked", "Idee geliked"],
  ["idea_media_uploaded", "Bilder zur Idee hochgeladen"],
  ["idea_media_updated", "Bild zur Idee bearbeitet"],
  ["idea_unliked", "Idee-Like entfernt"],
  ["invite_accepted", "Einladung angenommen"],
  ["invite_created", "Einladung erstellt"],
  ["invite_deleted", "Einladung gelöscht"],
  ["invite_email_resent", "Einladungsmail erneut gesendet"],
  ["invite_revoked", "Einladung widerrufen"],
  ["invite_sent_telegram", "Einladung per Telegram verschickt"],
  ["email_failed", "E-Mail fehlgeschlagen"],
  ["email_sent", "E-Mail gesendet"],
  ["email_skipped", "E-Mail übersprungen"],
  ["event_checkin_created", "Event Check-in"],
  ["event_created", "Event geplant"],
  ["event_deleted", "Event gelöscht"],
  ["event_updated", "Event geändert"],
  ["external_push_failed", "Externer Push fehlgeschlagen"],
  ["external_push_sent", "Externer Push gesendet"],
  ["feed_comment_created", "Feed kommentiert"],
  ["feed_liked", "Feed geliked"],
  ["feed_unliked", "Feed-Like entfernt"],
  ["login", "Login"],
  ["login_failed", "Login fehlgeschlagen"],
  ["logout", "Logout"],
  ["media_album_changed_telegram", "Bild per Telegram in Album verschoben"],
  ["media_album_changed", "Bild in Album verschoben"],
  ["media_commented", "Bild kommentiert"],
  ["media_created_telegram", "Bild per Telegram erstellt"],
  ["media_deleted", "Bild gelöscht"],
  ["media_updated", "Bild geändert"],
  ["media_uploaded", "Bild hochgeladen"],
  ["native_push_settings_updated", "Native Push gespeichert"],
  ["native_push_test", "Native Push Test"],
  ["native_push_notification_failed", "Native Push Benachrichtigung fehlgeschlagen"],
  ["native_push_notification_sent", "Native Push Benachrichtigung gesendet"],
  ["password_changed", "Eigenes Passwort geändert"],
  ["play_ready_changed", "Spielampel geändert"],
  ["play_ready_changed_api", "Spielampel per API geändert"],
  ["play_ready_changed_telegram_agent", "Spielampel per Telegram-Agent geändert"],
  ["play_ready_expired", "Spielampel abgelaufen"],
  ["play_ready_liked", "Spielampel geliked"],
  ["play_ready_unliked", "Spielampel-Like entfernt"],
  ["position_favorited", "Szene favorisiert"],
  ["position_unfavorited", "Szenen-Favorit entfernt"],
  ["self_bondage_order_accepted", "Self-Bondage-Auftrag angenommen"],
  ["self_bondage_order_completed", "Self-Bondage-Auftrag umgesetzt"],
  ["self_bondage_order_created", "Self-Bondage-Auftrag erteilt"],
  ["self_bondage_order_discarded", "Self-Bondage-Auftrag verworfen"],
  ["self_bondage_order_updated", "Self-Bondage-Auftrag geändert"],
  ["shopify_credentials_adopted", "Shopify-Credentials übernommen"],
  ["telegram_answer_sent", "Telegram-Antwort gesendet"],
  ["telegram_admin_sync_failed", "Telegram-Admin-Abgleich fehlgeschlagen"],
  ["telegram_admins_synced", "Telegram-Admins synchronisiert"],
  ["telegram_chat_save_failed", "Telegram-Chat speichern fehlgeschlagen"],
  ["telegram_direct_chat_detected", "Telegram-Direktchat erkannt"],
  ["telegram_direct_chat_enabled", "Telegram-Direktchat aktiviert"],
  ["telegram_image_received", "Telegram-Bild empfangen"],
  ["telegram_member_detected", "Telegram-Mitglied erkannt"],
  ["telegram_member_discovery_enabled", "Telegram-Mitgliedserkennung aktiviert"],
  ["telegram_member_discovery_failed", "Telegram-Mitgliedserkennung fehlgeschlagen"],
  ["telegram_member_left", "Telegram-Mitglied nicht mehr aktiv"],
  ["telegram_message_ignored", "Telegram-Nachricht ignoriert"],
  ["telegram_message_received", "Telegram-Nachricht empfangen"],
  ["telegram_notification_failed", "Telegram-Benachrichtigung fehlgeschlagen"],
  ["telegram_notification_sent", "Telegram-Benachrichtigung gesendet"],
  ["tracker_quota_reminder", "Tracker-Kontingent Erinnerung"],
  ["tracker_type_created", "Tracker angelegt"],
  ["tracker_type_updated", "Tracker bearbeitet"],
  ["toy_favorited", "Spielzeug favorisiert"],
  ["toy_unfavorited", "Spielzeug-Favorit entfernt"],
  ["user_password_set", "Benutzerpasswort gesetzt"]
] as const;

export function isLegacyAuditAction(action: string) {
  return legacyAuditActionPrefixes.some((prefix) => action.startsWith(prefix));
}

export function notificationActionAliases(action: string) {
  const aliases = new Set<string>([action]);

  const trackerMatch = action.match(/^tracker_(.+)_(started|stopped)_(api|control|telegram)$/);
  if (trackerMatch) aliases.add(`tracker_${trackerMatch[1]}_${trackerMatch[2]}`);

  const suffixes = [
    "_telegram_agent",
    "_via_control",
    "_control",
    "_telegram",
    "_api"
  ];
  for (const suffix of suffixes) {
    if (action.endsWith(suffix)) aliases.add(action.slice(0, -suffix.length));
  }

  return Array.from(aliases);
}

export function notificationRuleActionMatches(actions: string[]) {
  const matches = new Set<string>();
  for (const action of actions) {
    if (!action) continue;
    matches.add(action);
    if (notificationActionAliases(action).length > 1) continue;
    matches.add(`${action}_api`);
    matches.add(`${action}_control`);
    matches.add(`${action}_telegram`);
    matches.add(`${action}_telegram_agent`);
    matches.add(`${action}_via_control`);
  }
  return Array.from(matches);
}

function trackerActionLabel(action: string, trackerTitle?: string) {
  const match = action.match(/^tracker_(.+)_(created|updated|deleted|started|stopped|started_api|stopped_api|started_control|stopped_control|started_telegram|stopped_telegram)$/);
  if (!match) return null;
  const title = trackerTitle || match[1];
  const labels: Record<string, string> = {
    created: "angelegt",
    updated: "bearbeitet",
    deleted: "gelöscht",
    started: "gestartet",
    stopped: "beendet",
    started_api: "per API gestartet",
    stopped_api: "per API beendet",
    started_control: "per API-Steuerung gestartet",
    stopped_control: "per API-Steuerung beendet",
    started_telegram: "per Telegram gestartet",
    stopped_telegram: "per Telegram beendet"
  };
  return `${title} ${labels[match[2]] || match[2]}`;
}

export function actionLabel(action: string) {
  const known = knownAuditActions.find(([value]) => value === action)?.[1];
  if (known) return known;
  const trackerLabel = trackerActionLabel(action);
  if (trackerLabel) return trackerLabel;
  const words: Record<string, string> = {
    activity: "Spielplan",
    api: "API",
    auto: "automatisch",
    bondage: "Bondage-System",
    changed: "geändert",
    closed: "geschlossen",
    completed: "abgeschlossen",
    confirmed: "bestätigt",
    created: "angelegt",
    deleted: "gelöscht",
    domain: "Domain",
    email: "E-Mail",
    failed: "fehlgeschlagen",
    image: "Bild",
    item: "Eintrag",
    login: "Login",
    logout: "Logout",
    media: "Bild",
    notification: "Benachrichtigung",
    password: "Passwort",
    play: "Spielampel",
    product: "Produkt",
    ready: "Bereitschaft",
    received: "empfangen",
    refreshed: "erneuert",
    requested: "angefragt",
    reset: "zurückgesetzt",
    sent: "gesendet",
    session: "Session",
    self: "Self",
    settings: "Einstellungen",
    shopify: "Shopify",
    site: "Seite",
    started: "gestartet",
    stopped: "beendet",
    sync: "Sync",
    telegram: "Telegram",
    token: "Token",
    tracker: "Tracker",
    updated: "bearbeitet",
    uploaded: "hochgeladen",
    user: "Benutzer",
    viewed: "aufgerufen"
  };
  return action
    .split("_")
    .filter(Boolean)
    .map((part) => words[part] || part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

export async function notificationActionOptions({
  tenantId,
  auditActions = [],
  requestedAction
}: {
  tenantId?: string | null;
  auditActions?: string[];
  requestedAction?: string | null;
}) {
  const trackerTypes = await prisma.trackerType.findMany({
    where: {
      enabled: true,
      ...(tenantId ? { OR: [{ tenantId }, { tenantId: null }] } : {})
    },
    orderBy: [{ tenantId: "desc" }, { title: "asc" }]
  });
  const trackerActions = trackerTypes.flatMap((tracker) => [
    [`tracker_${tracker.key}_created`, `${tracker.title} angelegt`] as const,
    [`tracker_${tracker.key}_updated`, `${tracker.title} bearbeitet`] as const,
    [`tracker_${tracker.key}_deleted`, `${tracker.title} gelöscht`] as const,
    [`tracker_${tracker.key}_started`, `${tracker.title} gestartet`] as const,
    [`tracker_${tracker.key}_stopped`, `${tracker.title} beendet`] as const,
    [`tracker_${tracker.key}_started_api`, `${tracker.title} per API gestartet`] as const,
    [`tracker_${tracker.key}_stopped_api`, `${tracker.title} per API beendet`] as const,
    [`tracker_${tracker.key}_started_control`, `${tracker.title} per API-Steuerung gestartet`] as const,
    [`tracker_${tracker.key}_stopped_control`, `${tracker.title} per API-Steuerung beendet`] as const,
    [`tracker_${tracker.key}_started_telegram`, `${tracker.title} per Telegram gestartet`] as const,
    [`tracker_${tracker.key}_stopped_telegram`, `${tracker.title} per Telegram beendet`] as const
  ]);
  const labels = new Map<string, string>();
  for (const [action, label] of knownAuditActions) {
    if (!isLegacyAuditAction(action)) labels.set(action, label);
  }
  for (const [action, label] of trackerActions) labels.set(action, label);
  for (const action of auditActions) {
    if (!action || isLegacyAuditAction(action)) continue;
    if (!labels.has(action)) labels.set(action, actionLabel(action));
  }
  if (requestedAction && !isLegacyAuditAction(requestedAction)) labels.set(requestedAction, labels.get(requestedAction) || actionLabel(requestedAction));
  return Array.from(labels, ([action, label]) => ({ action, label })).sort((a, b) => a.label.localeCompare(b.label));
}

export function defaultNotificationTemplate() {
  return [
    "🔔 <b>{title}</b>",
    "",
    "👤 {actor}",
    "🏷️ {event}",
    "{url}"
  ].join("\n");
}
