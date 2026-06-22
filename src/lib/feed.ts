import { actionLabel } from "@/lib/notification-actions";

type FeedActor = {
  profile?: { displayName?: string | null } | null;
  name?: string | null;
  username?: string | null;
  email?: string | null;
} | null;

type FeedAudit = {
  action: string;
  title: string;
  href?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  details?: unknown;
};

export const feedTemplateVariables = [
  { token: "{title}", label: "Titel" },
  { token: "{actor}", label: "Benutzer" },
  { token: "{event}", label: "Event" },
  { token: "{action}", label: "Aktion" },
  { token: "{url}", label: "Link" },
  { token: "{details}", label: "Details" }
];

export function defaultFeedTitleTemplate() {
  return "{title}";
}

export function defaultFeedBodyTemplate() {
  return "{actor} · {event}";
}

export function feedActorName(actor?: FeedActor) {
  return actor?.profile?.displayName || actor?.name || actor?.username || actor?.email || "System";
}

export function feedDetailsText(details: unknown) {
  if (!details || typeof details !== "object" || Array.isArray(details)) return "";
  const data = details as Record<string, unknown>;
  const preferred = data.text || data.answer || data.caption || data.status || data.next || data.previous;
  if (preferred != null) return String(preferred);
  try {
    return JSON.stringify(data);
  } catch {
    return "";
  }
}

export function renderFeedTemplate(template: string, audit: FeedAudit, actor?: FeedActor) {
  const variables: Record<string, string> = {
    title: audit.title,
    actor: feedActorName(actor),
    event: actionLabel(audit.action),
    action: audit.action,
    url: audit.href || "",
    details: feedDetailsText(audit.details)
  };
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key: string) => variables[key] ?? "");
}
