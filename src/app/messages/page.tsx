import Link from "next/link";
import { redirect } from "next/navigation";
import { BellRing, ChevronRight, Clock3, ExternalLink, History, Mail, Newspaper, Save, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ProtocolSearch } from "@/components/protocol-search";
import { TemplateVariableTextarea } from "@/components/template-variable-textarea";
import { Badge, Button, EmptyState, Field, inputClass, PageGuide, PageHeader, Panel, selectClass } from "@/components/ui";
import { accessibleOwnerIds } from "@/lib/access";
import { currentUser } from "@/lib/auth";
import { appTimeZone, formatDate } from "@/lib/dates";
import { defaultFeedBodyTemplate, defaultFeedTitleTemplate, feedTemplateVariables } from "@/lib/feed";
import { requireFeature } from "@/lib/features";
import { actionLabel, knownAuditActions } from "@/lib/notification-actions";
import { prisma } from "@/lib/prisma";
import { currentTenant } from "@/lib/tenancy";
import { testExternalPushRule } from "@/lib/external-push-notifications";

const pageSize = 120;
const legacyMessageLimit = 60;

type ProtocolEntry = {
  id: string;
  createdAt: Date;
  actor: string;
  title: string;
  action?: string;
  body?: string;
  href?: string | null;
  source: "audit" | "telegram" | "message";
};

function detailBody(details: unknown) {
  if (!details || typeof details !== "object") return "";
  const data = details as Record<string, unknown>;
  return String(data.text || data.answer || data.caption || "");
}

function hourLabel(value: Date) {
  return new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: appTimeZone }).format(value);
}

function hourGroupLabel(value: Date) {
  return `${new Intl.DateTimeFormat("de-DE", { hour: "2-digit", timeZone: appTimeZone }).format(value)} Uhr`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function sanitizeTelegramHtml(value: string) {
  const withoutPrefix = value.replace(/^Telegram-Agent:\s*/, "").replace(/^Telegram:\s*/, "");
  let html = escapeHtml(withoutPrefix);
  const simpleTags = ["b", "strong", "i", "em", "u", "s", "code", "pre"];
  for (const tag of simpleTags) {
    html = html.replace(new RegExp(`&lt;${tag}&gt;`, "gi"), `<${tag}>`);
    html = html.replace(new RegExp(`&lt;/${tag}&gt;`, "gi"), `</${tag}>`);
  }
  html = html.replace(
    /&lt;a href=&quot;(https?:\/\/[^"&<>\s]+|\/[^"&<>\s]*)&quot;&gt;([\s\S]*?)&lt;\/a&gt;/gi,
    (_match, href: string, label: string) =>
      `<a href="${href}" class="font-semibold text-redbrand underline decoration-redbrand/30 underline-offset-2">${label}</a>`
  );
  return html.replace(/\n/g, "<br />");
}

function actorName(user?: { profile?: { displayName?: string | null } | null; name?: string | null; username?: string | null; email?: string | null } | null) {
  return user?.profile?.displayName || user?.name || user?.username || user?.email || "System";
}

function dayKey(value: Date) {
  return new Intl.DateTimeFormat("sv-SE", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: appTimeZone }).format(value);
}

function groupEntries(entries: ProtocolEntry[]) {
  const days = new Map<string, { label: string; entries: ProtocolEntry[] }>();
  for (const entry of entries) {
    const key = dayKey(entry.createdAt);
    const day = days.get(key) || { label: formatDate(entry.createdAt), entries: [] };
    day.entries.push(entry);
    days.set(key, day);
  }
  return Array.from(days.entries()).map(([key, day]) => {
    const hours = new Map<string, ProtocolEntry[]>();
    for (const entry of day.entries) {
      const hour = hourGroupLabel(entry.createdAt);
      hours.set(hour, [...(hours.get(hour) || []), entry]);
    }
    return { key, label: day.label, count: day.entries.length, hours: Array.from(hours.entries()) };
  });
}

async function currentAdminForProtocol() {
  const user = await currentUser();
  if (!user) redirect("/login");
  await requireFeature("auditLog");
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") redirect("/");
  return user;
}

async function saveFeedRule(formData: FormData) {
  "use server";
  await currentAdminForProtocol();
  const tenant = await currentTenant();
  const action = String(formData.get("action") || "").trim();
  if (!action) redirect("/messages#feed-rules");
  await prisma.feedRule.upsert({
    where: { tenantId_action: { tenantId: tenant.id, action } },
    update: {
      active: formData.get("active") === "on",
      titleTemplate: String(formData.get("titleTemplate") || "").trim() || defaultFeedTitleTemplate(),
      bodyTemplate: String(formData.get("bodyTemplate") || "").trim() || defaultFeedBodyTemplate()
    },
    create: {
      tenantId: tenant.id,
      action,
      active: formData.get("active") === "on",
      titleTemplate: String(formData.get("titleTemplate") || "").trim() || defaultFeedTitleTemplate(),
      bodyTemplate: String(formData.get("bodyTemplate") || "").trim() || defaultFeedBodyTemplate()
    }
  });
  redirect(`/messages?action=${encodeURIComponent(action)}#feed-rules`);
}

async function deleteFeedRule(formData: FormData) {
  "use server";
  await currentAdminForProtocol();
  const tenant = await currentTenant();
  await prisma.feedRule.deleteMany({
    where: { id: String(formData.get("ruleId") || ""), tenantId: tenant.id }
  });
  redirect("/messages#feed-rules");
}

function defaultExternalPayloadTemplate() {
  return "{\"title\":\"{title}\",\"event\":\"{event}\",\"actor\":\"{actor}\",\"url\":\"{url}\",\"details\":{detailsJson}}";
}

async function saveExternalPushRule(formData: FormData) {
  "use server";
  await currentAdminForProtocol();
  const tenant = await currentTenant();
  const id = String(formData.get("ruleId") || "");
  const action = String(formData.get("action") || "").trim();
  const url = String(formData.get("url") || "").trim();
  if (!action || !url) redirect("/messages#external-push");
  let headersJson = {};
  try {
    headersJson = JSON.parse(String(formData.get("headersJson") || "{}"));
  } catch {
    headersJson = {};
  }
  const data = {
    tenantId: tenant.id,
    action,
    name: String(formData.get("name") || "").trim() || actionLabel(action),
    url,
    method: String(formData.get("method") || "POST"),
    headersJson,
    payloadTemplate: String(formData.get("payloadTemplate") || "").trim() || defaultExternalPayloadTemplate(),
    active: formData.get("active") === "on"
  };
  if (id) {
    await prisma.externalPushRule.updateMany({ where: { id, tenantId: tenant.id }, data });
  } else {
    await prisma.externalPushRule.create({ data });
  }
  redirect(`/messages?action=${encodeURIComponent(action)}#external-push`);
}

async function deleteExternalPushRule(formData: FormData) {
  "use server";
  await currentAdminForProtocol();
  const tenant = await currentTenant();
  await prisma.externalPushRule.deleteMany({
    where: { id: String(formData.get("ruleId") || ""), tenantId: tenant.id }
  });
  redirect("/messages#external-push");
}

async function testExternalRule(formData: FormData) {
  "use server";
  const user = await currentAdminForProtocol();
  const result = await testExternalPushRule(String(formData.get("ruleId") || ""), user.id);
  redirect(`/messages?externalSent=${result.sent}&externalFailed=${result.failed}#external-push`);
}

export default async function MessagesPage({ searchParams }: { searchParams?: { page?: string; action?: string; actor?: string; externalSent?: string; externalFailed?: string } }) {
  await requireFeature("auditLog");
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") redirect("/");
  const tenant = await currentTenant();
  const accessIds = await accessibleOwnerIds(user);
  const page = Math.max(1, Number(searchParams?.page || 1) || 1);
  const skip = (page - 1) * pageSize;
  const selectedActorId = accessIds.includes(String(searchParams?.actor || "")) ? String(searchParams?.actor) : "";
  const auditWhere = selectedActorId
    ? { actorId: selectedActorId }
    : { OR: [{ actorId: { in: accessIds } }, { actorId: null }] };
  const legacyWhere = selectedActorId
    ? { senderId: selectedActorId }
    : { OR: [{ senderId: { in: accessIds } }, { recipientId: user.id }, { recipientId: null, senderId: { in: accessIds } }] };

  const [auditLogs, legacyMessages, totalAuditLogs, distinctActions, feedRules, externalPushRules, externalPushLogs, filterUsers] = await Promise.all([
    prisma.auditLog.findMany({
      where: auditWhere,
      include: { actor: { include: { profile: true } } },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize
    }),
    page === 1
      ? prisma.message.findMany({
          where: legacyWhere,
          include: { sender: { include: { profile: true } }, recipient: true },
          orderBy: { createdAt: "desc" },
          take: legacyMessageLimit
        })
      : Promise.resolve([]),
    prisma.auditLog.count({ where: auditWhere }),
    prisma.auditLog.findMany({
      distinct: ["action"],
      select: { action: true },
      orderBy: { action: "asc" }
    }),
    prisma.feedRule.findMany({
      where: { tenantId: tenant.id },
      orderBy: [{ active: "desc" }, { action: "asc" }]
    }),
    prisma.externalPushRule.findMany({
      where: { tenantId: tenant.id },
      orderBy: [{ active: "desc" }, { action: "asc" }]
    }),
    prisma.externalPushLog.findMany({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: "desc" },
      take: 20
    }),
    prisma.user.findMany({
      where: { id: { in: accessIds } },
      include: { profile: true },
      orderBy: [{ name: "asc" }, { email: "asc" }]
    })
  ]);

  const auditEntries: ProtocolEntry[] = auditLogs.map((entry) => ({
      id: entry.id,
      createdAt: entry.createdAt,
      actor: actorName(entry.actor),
      title: entry.title,
      action: entry.action,
      body: detailBody(entry.details),
      href: entry.href,
      source: "audit" as const
    }));
  const legacyEntries: ProtocolEntry[] = legacyMessages.flatMap((message) => {
      const isTelegram = message.body.startsWith("Telegram");
      const duplicateAudit = isTelegram && auditEntries.some((entry) =>
        entry.actor === actorName(message.sender) &&
        Math.abs(entry.createdAt.getTime() - message.createdAt.getTime()) < 10000 &&
        entry.title.toLowerCase().includes(message.body.startsWith("Telegram-Agent") ? "antwort" : "telegram")
      );
      if (duplicateAudit) return [];
      return {
        id: message.id,
        createdAt: message.createdAt,
        actor: actorName(message.sender),
        title: isTelegram ? (message.body.startsWith("Telegram-Agent") ? "Telegram-Agent" : "Telegram-Nachricht") : "Alte Nachricht",
        body: message.body,
        href: message.mediaUrl || null,
        source: isTelegram ? ("telegram" as const) : ("message" as const)
      };
    });
  const entries: ProtocolEntry[] = [...auditEntries, ...legacyEntries].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const groups = groupEntries(entries);
  const hasNext = skip + pageSize < totalAuditLogs;
  const requestedAction = String(searchParams?.action || "").trim();
  const actionOptions = Array.from(new Set([...knownAuditActions.map(([action]) => action), ...distinctActions.map((entry) => entry.action), requestedAction].filter(Boolean))).sort((a, b) => actionLabel(a).localeCompare(actionLabel(b)));
  const pageQuery = selectedActorId ? `&actor=${encodeURIComponent(selectedActorId)}` : "";

  return (
    <AppShell>
      <PageHeader title="Protokoll" />
      <div className="space-y-4">
        <ProtocolSearch suggestions={entries.map((entry) => ({ id: entry.id, title: entry.title, actor: entry.actor, body: entry.body || "" }))} />
        <Panel>
          <form className="flex flex-col gap-3 sm:flex-row sm:items-end" action="/messages">
            <Field label="Protokoll nach Benutzer filtern">
              <select className={selectClass} name="actor" defaultValue={selectedActorId}>
                <option value="">Alle sichtbaren Benutzer</option>
                {filterUsers.map((entry) => (
                  <option key={entry.id} value={entry.id}>{actorName(entry)}</option>
                ))}
              </select>
            </Field>
            {requestedAction ? <input type="hidden" name="action" value={requestedAction} /> : null}
            <Button>Filter anwenden</Button>
            {selectedActorId ? (
              <Link href="/messages" className="inline-flex min-h-10 items-center justify-center rounded-md border border-line bg-surface px-4 py-2 text-sm font-semibold hover:bg-paper">
                Filter entfernen
              </Link>
            ) : null}
          </form>
        </Panel>
        <Panel className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-paper text-redbrand">
              <History className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-semibold text-ink">Aktivitäten und Telegram-Verlauf</h2>
              <p className="text-sm text-graphite">Geladen werden jeweils {pageSize} Protokolleinträge, alte Telegram-Nachrichten nur auf der ersten Seite.</p>
            </div>
          </div>
          <Badge>{totalAuditLogs} App-Einträge</Badge>
        </Panel>

        {groups.length ? (
          <div className="space-y-4">
            {groups.map((day, dayIndex) => (
              <details key={day.key} open={dayIndex === 0} className="overflow-hidden rounded-lg border border-line bg-surface shadow-soft">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 bg-paper px-4 py-3 font-semibold text-ink [&::-webkit-details-marker]:hidden">
                  <span>{day.label}</span>
                  <span className="text-sm font-medium text-graphite">{day.count} Einträge</span>
                </summary>
                <div className="divide-y divide-line">
                  {day.hours.map(([hour, hourEntries], hourIndex) => (
                    <details key={hour} open={dayIndex === 0 && hourIndex === 0} className="group">
                      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-graphite hover:bg-paper [&::-webkit-details-marker]:hidden">
                        <Clock3 className="h-4 w-4 text-redbrand" />
                        {hour}
                        <span className="ml-auto text-xs font-medium">{hourEntries.length}</span>
                      </summary>
                      <div className="space-y-2 bg-canvas/40 px-3 pb-3">
                        {hourEntries.map((entry) => (
                          <article key={entry.id} id={`entry-${entry.id}`} className="scroll-mt-24 rounded-md border border-line bg-surface p-3">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <strong className="text-sm text-ink">{entry.title}</strong>
                                  {entry.source === "telegram" ? <Badge tone="red">Telegram</Badge> : null}
                                  {entry.source === "message" ? <Badge>Nachricht</Badge> : null}
                                </div>
                                <p className="mt-1 text-xs text-graphite">
                                  {entry.actor} · {hourLabel(entry.createdAt)}
                                </p>
                              </div>
                              {entry.href ? (
                                <Link href={entry.href} className="focus-ring inline-flex min-h-9 items-center gap-1 rounded-md border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:bg-paper hover:text-redbrand">
                                  Öffnen <ExternalLink className="h-3.5 w-3.5" />
                                </Link>
                              ) : null}
                              {entry.action ? (
                                <>
                                  <Link
                                    href={`/messages?action=${encodeURIComponent(entry.action)}#feed-rules`}
                                    className="focus-ring inline-flex min-h-9 items-center gap-1 rounded-md border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:bg-paper hover:text-redbrand"
                                  >
                                    In Feed <Newspaper className="h-3.5 w-3.5" />
                                  </Link>
                                  <Link
                                    href={`/settings/telegram?action=${encodeURIComponent(entry.action)}#notifications`}
                                    className="focus-ring inline-flex min-h-9 items-center gap-1 rounded-md border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:bg-paper hover:text-redbrand"
                                  >
                                    Telegram <BellRing className="h-3.5 w-3.5" />
                                  </Link>
                                  <Link
                                    href={`/settings/email?action=${encodeURIComponent(entry.action)}#notifications`}
                                    className="focus-ring inline-flex min-h-9 items-center gap-1 rounded-md border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:bg-paper hover:text-redbrand"
                                  >
                                    E-Mail <Mail className="h-3.5 w-3.5" />
                                  </Link>
                                </>
                              ) : null}
                            </div>
                            {entry.body ? (
                              <div
                                className="mt-3 rounded-md bg-paper p-3 text-sm leading-6 text-graphite [&_code]:rounded [&_code]:bg-surface [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_strong]:text-ink"
                                dangerouslySetInnerHTML={{ __html: sanitizeTelegramHtml(entry.body) }}
                              />
                            ) : null}
                          </article>
                        ))}
                      </div>
                    </details>
                  ))}
                </div>
              </details>
            ))}
          </div>
        ) : (
          <EmptyState title="Noch keine Protokolleinträge">
            Sobald Aktionen in der App oder im Telegram-Bot passieren, erscheinen sie hier.
          </EmptyState>
        )}

        <Panel id="feed-rules">
          <div className="mb-4 flex items-start gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-paper text-redbrand">
              <Newspaper className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-semibold text-ink">Startseiten-Feed</h2>
              <p className="mt-1 text-sm leading-6 text-graphite">
                Wähle Protokollaktionen aus, die im Feed auf der Startseite erscheinen sollen. Die Darstellung kannst du mit Variablen steuern.
              </p>
            </div>
          </div>
          <form action={saveFeedRule} className="space-y-4 rounded-lg border border-line bg-paper p-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <Field label="Aktion">
                <select className={selectClass} name="action" defaultValue={requestedAction || actionOptions[0] || ""} required>
                  {actionOptions.map((action) => <option key={action} value={action}>{actionLabel(action)}</option>)}
                </select>
              </Field>
              <label className="flex min-h-10 items-center gap-2 text-sm font-semibold text-graphite">
                <input name="active" type="checkbox" defaultChecked className="h-4 w-4 accent-redbrand" />
                aktiv
              </label>
            </div>
            <TemplateVariableTextarea label="Feed-Titel" name="titleTemplate" rows={2} defaultValue={defaultFeedTitleTemplate()} variables={feedTemplateVariables} required />
            <TemplateVariableTextarea label="Feed-Text" name="bodyTemplate" rows={3} defaultValue={defaultFeedBodyTemplate()} variables={feedTemplateVariables} required />
            <Button><Save className="h-4 w-4" /> Feed-Regel speichern</Button>
          </form>
          <div className="mt-5 space-y-3">
            {feedRules.map((rule) => (
              <details key={rule.id} className="rounded-md border border-line bg-paper p-3">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
                  <span>
                    <strong className="block text-ink">{actionLabel(rule.action)}</strong>
                    <span className="text-sm text-graphite">{rule.active ? "aktiv" : "inaktiv"}</span>
                  </span>
                  <Badge tone={rule.active ? "green" : "neutral"}>{rule.active ? "Feed" : "aus"}</Badge>
                </summary>
                <form action={saveFeedRule} className="mt-4 space-y-4 border-t border-line pt-4">
                  <Field label="Aktion">
                    <select className={selectClass} name="action" defaultValue={rule.action} required>
                      {actionOptions.map((action) => <option key={action} value={action}>{actionLabel(action)}</option>)}
                    </select>
                  </Field>
                  <TemplateVariableTextarea label="Feed-Titel" name="titleTemplate" rows={2} defaultValue={rule.titleTemplate} variables={feedTemplateVariables} required />
                  <TemplateVariableTextarea label="Feed-Text" name="bodyTemplate" rows={3} defaultValue={rule.bodyTemplate} variables={feedTemplateVariables} required />
                  <label className="flex items-center gap-2 text-sm font-semibold text-graphite">
                    <input name="active" type="checkbox" defaultChecked={rule.active} className="h-4 w-4 accent-redbrand" />
                    aktiv
                  </label>
                  <Button><Save className="h-4 w-4" /> Regel speichern</Button>
                </form>
                <form action={deleteFeedRule} className="mt-3">
                  <input type="hidden" name="ruleId" value={rule.id} />
                  <Button variant="danger"><Trash2 className="h-4 w-4" /> Feed-Regel löschen</Button>
                </form>
              </details>
            ))}
            {!feedRules.length ? <p className="rounded-md border border-dashed border-line bg-paper p-4 text-sm text-graphite">Noch keine Feed-Regel angelegt.</p> : null}
          </div>
        </Panel>

        <Panel id="external-push">
          <div className="mb-4 flex items-start gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-paper text-redbrand">
              <ExternalLink className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-semibold text-ink">Externe Push-Regeln</h2>
              <p className="mt-1 text-sm leading-6 text-graphite">
                Sende Ereignisse als HTTP-Webhook an ioBroker, Node-RED, Home Assistant oder eine MQTT-Bridge. So können Alexa-Ansagen, Lichtschalter oder andere IoT-Aktionen ausgelöst werden.
              </p>
            </div>
          </div>
          {searchParams?.externalSent ? (
            <div className="mb-4 rounded-md border border-line bg-paper p-3 text-sm text-graphite">
              Test gesendet: <strong className="text-ink">{searchParams.externalSent}</strong>
              {Number(searchParams.externalFailed || 0) ? <span className="ml-2 text-redbrand">Fehler: {searchParams.externalFailed}</span> : null}
            </div>
          ) : null}
          <form action={saveExternalPushRule} className="space-y-4 rounded-lg border border-line bg-paper p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name"><input className={inputClass} name="name" placeholder="ioBroker Alexa Ansage" /></Field>
              <Field label="Aktion">
                <select className={selectClass} name="action" defaultValue={requestedAction || actionOptions[0] || ""} required>
                  {actionOptions.map((action) => <option key={action} value={action}>{actionLabel(action)}</option>)}
                </select>
              </Field>
              <Field label="URL"><input className={inputClass} name="url" type="url" placeholder="https://iobroker.example/webhook/playplaner" required /></Field>
              <Field label="Methode">
                <select className={selectClass} name="method" defaultValue="POST">
                  <option value="POST">POST</option>
                  <option value="PUT">PUT</option>
                  <option value="GET">GET</option>
                </select>
              </Field>
            </div>
            <TemplateVariableTextarea label="JSON-Payload" name="payloadTemplate" rows={5} defaultValue={defaultExternalPayloadTemplate()} variables={[...feedTemplateVariables, { token: "{detailsJson}", label: "Details JSON" }]} required />
            <Field label="Header als JSON optional">
              <textarea className={inputClass} name="headersJson" rows={3} defaultValue={"{}"} />
            </Field>
            <label className="flex items-center gap-2 text-sm font-semibold text-graphite">
              <input name="active" type="checkbox" defaultChecked className="h-4 w-4 accent-redbrand" />
              aktiv
            </label>
            <Button><Save className="h-4 w-4" /> Push-Regel speichern</Button>
          </form>
          <div className="mt-5 space-y-3">
            {externalPushRules.map((rule) => (
              <details key={rule.id} className="rounded-md border border-line bg-paper p-3">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
                  <span>
                    <strong className="block text-ink">{rule.name}</strong>
                    <span className="text-sm text-graphite">{actionLabel(rule.action)} · {rule.url}</span>
                  </span>
                  <Badge tone={rule.active ? "green" : "neutral"}>{rule.active ? "aktiv" : "aus"}</Badge>
                </summary>
                <form action={saveExternalPushRule} className="mt-4 space-y-4 border-t border-line pt-4">
                  <input type="hidden" name="ruleId" value={rule.id} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Name"><input className={inputClass} name="name" defaultValue={rule.name} required /></Field>
                    <Field label="Aktion">
                      <select className={selectClass} name="action" defaultValue={rule.action} required>
                        {actionOptions.map((action) => <option key={action} value={action}>{actionLabel(action)}</option>)}
                      </select>
                    </Field>
                    <Field label="URL"><input className={inputClass} name="url" type="url" defaultValue={rule.url} required /></Field>
                    <Field label="Methode">
                      <select className={selectClass} name="method" defaultValue={rule.method || "POST"}>
                        <option value="POST">POST</option>
                        <option value="PUT">PUT</option>
                        <option value="GET">GET</option>
                      </select>
                    </Field>
                  </div>
                  <TemplateVariableTextarea label="JSON-Payload" name="payloadTemplate" rows={5} defaultValue={rule.payloadTemplate} variables={[...feedTemplateVariables, { token: "{detailsJson}", label: "Details JSON" }]} required />
                  <Field label="Header als JSON optional">
                    <textarea className={inputClass} name="headersJson" rows={3} defaultValue={JSON.stringify(rule.headersJson || {}, null, 2)} />
                  </Field>
                  <label className="flex items-center gap-2 text-sm font-semibold text-graphite">
                    <input name="active" type="checkbox" defaultChecked={rule.active} className="h-4 w-4 accent-redbrand" />
                    aktiv
                  </label>
                  <Button><Save className="h-4 w-4" /> Regel speichern</Button>
                </form>
                <div className="mt-3 flex flex-wrap gap-2">
                  <form action={testExternalRule}>
                    <input type="hidden" name="ruleId" value={rule.id} />
                    <Button>Test senden</Button>
                  </form>
                  <form action={deleteExternalPushRule}>
                    <input type="hidden" name="ruleId" value={rule.id} />
                    <Button variant="danger"><Trash2 className="h-4 w-4" /> Regel löschen</Button>
                  </form>
                </div>
              </details>
            ))}
            {!externalPushRules.length ? <p className="rounded-md border border-dashed border-line bg-paper p-4 text-sm text-graphite">Noch keine externe Push-Regel angelegt.</p> : null}
          </div>
          {externalPushLogs.length ? (
            <div className="mt-5 rounded-lg border border-line bg-paper p-4">
              <h3 className="mb-3 font-semibold text-ink">Letzte externen Pushes</h3>
              <div className="space-y-2 text-sm">
                {externalPushLogs.map((log) => (
                  <div key={log.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface p-2">
                    <span className="truncate">{actionLabel(log.action)} · {log.url}</span>
                    <Badge tone={log.status === "SENT" ? "green" : "red"}>{log.statusCode || log.status}</Badge>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </Panel>

        <div className="flex flex-wrap items-center justify-between gap-3">
          {page > 1 ? (
            <Link href={`/messages?page=${page - 1}${pageQuery}`} className="focus-ring inline-flex min-h-10 items-center rounded-md border border-line bg-surface px-4 py-2 text-sm font-semibold hover:bg-paper">
              Zurück
            </Link>
          ) : <span />}
          {hasNext ? (
            <Link href={`/messages?page=${page + 1}${pageQuery}`} className="focus-ring inline-flex min-h-10 items-center gap-2 rounded-md bg-redbrand px-4 py-2 text-sm font-semibold text-white hover:bg-redbrandHover">
              Weitere laden <ChevronRight className="h-4 w-4" />
            </Link>
          ) : null}
        </div>
      </div>
      <PageGuide title="Protokoll und Aktivitätsverlauf">
        Das Protokoll sammelt wichtige Aktionen aus der App und die bisherigen Telegram-Nachrichten. Tage und Stunden lassen sich aufklappen; direkte Links führen zur passenden Detailseite, sofern der Datensatz noch vorhanden ist.
      </PageGuide>
    </AppShell>
  );
}
