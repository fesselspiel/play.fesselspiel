export const knownAuditActions = [
  ["activity_confirmed", "Spielplan bestätigt"],
  ["activity_created", "Spielplan angelegt"],
  ["activity_confirmed_telegram", "Spielplan per Telegram bestätigt"],
  ["activity_requested", "Spielplan angefragt"],
  ["activity_requested_telegram", "Spielplan per Telegram angefragt"],
  ["idea_created", "Idee festgehalten"],
  ["idea_media_uploaded", "Bilder zur Idee hochgeladen"],
  ["kg_auto_closed", "KG-Tracker automatisch geschlossen"],
  ["kg_created", "KG-Tracker angelegt"],
  ["kg_deleted", "KG-Tracker gelöscht"],
  ["kg_started_api", "KG-Tracker per API gestartet"],
  ["kg_started_telegram", "KG-Tracker per Telegram gestartet"],
  ["kg_stopped", "KG-Tracker beendet"],
  ["kg_stopped_api", "KG-Tracker per API beendet"],
  ["kg_stopped_telegram", "KG-Tracker per Telegram beendet"],
  ["kg_updated", "KG-Tracker bearbeitet"],
  ["login", "Login"],
  ["login_failed", "Login fehlgeschlagen"],
  ["logout", "Logout"],
  ["media_album_changed_telegram", "Bild per Telegram in Album verschoben"],
  ["media_created_telegram", "Bild per Telegram erstellt"],
  ["play_ready_changed", "Spielampel geändert"],
  ["self_bondage_order_accepted", "Self-Bondage-Auftrag angenommen"],
  ["self_bondage_order_completed", "Self-Bondage-Auftrag umgesetzt"],
  ["self_bondage_order_created", "Self-Bondage-Auftrag erteilt"],
  ["self_bondage_order_discarded", "Self-Bondage-Auftrag verworfen"],
  ["self_bondage_order_updated", "Self-Bondage-Auftrag geändert"],
  ["session_auto_closed", "Session automatisch geschlossen"],
  ["session_commented", "Session kommentiert"],
  ["session_created", "Session angelegt"],
  ["session_deleted", "Session gelöscht"],
  ["session_media_commented", "Session-Bild kommentiert"],
  ["session_media_uploaded", "Session-Bild hochgeladen"],
  ["session_stopped", "Session beendet"],
  ["session_started_api", "Session per API gestartet"],
  ["session_stopped_api", "Session per API beendet"],
  ["session_updated", "Session bearbeitet"],
  ["session_viewed", "Session aufgerufen"],
  ["telegram_answer_sent", "Telegram-Antwort gesendet"],
  ["telegram_admin_sync_failed", "Telegram-Admin-Abgleich fehlgeschlagen"],
  ["telegram_admins_synced", "Telegram-Admins synchronisiert"],
  ["telegram_image_received", "Telegram-Bild empfangen"],
  ["telegram_member_detected", "Telegram-Mitglied erkannt"],
  ["telegram_member_left", "Telegram-Mitglied nicht mehr aktiv"],
  ["telegram_message_ignored", "Telegram-Nachricht ignoriert"],
  ["telegram_message_received", "Telegram-Nachricht empfangen"],
  ["telegram_notification_failed", "Telegram-Benachrichtigung fehlgeschlagen"],
  ["telegram_notification_sent", "Telegram-Benachrichtigung gesendet"]
] as const;

export function actionLabel(action: string) {
  const known = knownAuditActions.find(([value]) => value === action)?.[1];
  if (known) return known;
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

export function defaultNotificationTemplate() {
  return [
    "🔔 <b>{title}</b>",
    "",
    "👤 {actor}",
    "🏷️ {event}",
    "{url}"
  ].join("\n");
}
