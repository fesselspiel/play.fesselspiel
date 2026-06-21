import Link from "next/link";
import { redirect } from "next/navigation";
import { BellRing, ChevronRight, Clock3, ExternalLink, History } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ProtocolSearch } from "@/components/protocol-search";
import { Badge, EmptyState, PageGuide, PageHeader, Panel } from "@/components/ui";
import { accessibleOwnerIds } from "@/lib/access";
import { currentUser } from "@/lib/auth";
import { appTimeZone, formatDate } from "@/lib/dates";
import { requireFeature } from "@/lib/features";
import { prisma } from "@/lib/prisma";

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

export default async function MessagesPage({ searchParams }: { searchParams?: { page?: string } }) {
  await requireFeature("auditLog");
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") redirect("/");
  const accessIds = await accessibleOwnerIds(user);
  const page = Math.max(1, Number(searchParams?.page || 1) || 1);
  const skip = (page - 1) * pageSize;

  const [auditLogs, legacyMessages, totalAuditLogs] = await Promise.all([
    prisma.auditLog.findMany({
      where: { OR: [{ actorId: { in: accessIds } }, { actorId: null }] },
      include: { actor: { include: { profile: true } } },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize
    }),
    page === 1
      ? prisma.message.findMany({
          where: { OR: [{ senderId: { in: accessIds } }, { recipientId: user.id }, { recipientId: null, senderId: { in: accessIds } }] },
          include: { sender: { include: { profile: true } }, recipient: true },
          orderBy: { createdAt: "desc" },
          take: legacyMessageLimit
        })
      : Promise.resolve([]),
    prisma.auditLog.count({ where: { OR: [{ actorId: { in: accessIds } }, { actorId: null }] } })
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

  return (
    <AppShell>
      <PageHeader title="Protokoll" />
      <div className="space-y-4">
        <ProtocolSearch suggestions={entries.map((entry) => ({ id: entry.id, title: entry.title, actor: entry.actor, body: entry.body || "" }))} />
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
                                <Link
                                  href={`/settings/telegram?action=${encodeURIComponent(entry.action)}#notifications`}
                                  className="focus-ring inline-flex min-h-9 items-center gap-1 rounded-md border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:bg-paper hover:text-redbrand"
                                >
                                  Benachrichtigung <BellRing className="h-3.5 w-3.5" />
                                </Link>
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

        <div className="flex flex-wrap items-center justify-between gap-3">
          {page > 1 ? (
            <Link href={`/messages?page=${page - 1}`} className="focus-ring inline-flex min-h-10 items-center rounded-md border border-line bg-surface px-4 py-2 text-sm font-semibold hover:bg-paper">
              Zurück
            </Link>
          ) : <span />}
          {hasNext ? (
            <Link href={`/messages?page=${page + 1}`} className="focus-ring inline-flex min-h-10 items-center gap-2 rounded-md bg-redbrand px-4 py-2 text-sm font-semibold text-white hover:bg-redbrandHover">
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
