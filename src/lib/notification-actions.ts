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
  ["media_album_changed_telegram", "Medium per Telegram in Album verschoben"],
  ["media_created_telegram", "Medium per Telegram erstellt"],
  ["play_ready_changed", "Spielampel geändert"],
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
  ["telegram_image_received", "Telegram-Bild empfangen"],
  ["telegram_message_received", "Telegram-Nachricht empfangen"]
] as const;

export function actionLabel(action: string) {
  return knownAuditActions.find(([value]) => value === action)?.[1] || action;
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
