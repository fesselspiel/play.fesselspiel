import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { Copy, Mail, Send, Ticket, Trash2, UserPlus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Button, Field, inputClass, PageGuide, PageHeader, Panel, selectClass } from "@/components/ui";
import { logAction } from "@/lib/audit";
import { currentUser } from "@/lib/auth";
import { requireFeature } from "@/lib/features";
import { createInvite, inviteUsage, inviteUrl, resendInviteEmail } from "@/lib/invites";
import { prisma } from "@/lib/prisma";
import { currentTenant } from "@/lib/tenancy";
import { sendTelegramMessage, telegramHtml, telegramLink } from "@/lib/telegram";
import { clientAddressFromHeaders, consumeRateLimit } from "@/lib/security-rate-limit";

function inviteLabel(invite: { status: string; acceptedBy?: { profile?: { displayName?: string | null } | null; name?: string | null; username?: string | null; email?: string | null } | null }) {
  if (invite.status === "ACCEPTED") return "angenommen";
  if (invite.status === "REVOKED") return "widerrufen";
  return "offen";
}

async function createInviteAction(formData: FormData) {
  "use server";
  await requireFeature("invites");
  const user = await currentUser();
  if (!user) redirect("/login");
  const requestHeaders = await headers();
  const host = requestHeaders.get("host")?.toLowerCase() || "unknown";
  const rate = await consumeRateLimit(
    { scope: "invite-create-web", limit: 10, windowMs: 60 * 60_000, blockMs: 60 * 60_000 },
    `${host}:${user.id}:${clientAddressFromHeaders(requestHeaders)}`
  );
  if (!rate.allowed) redirect("/settings/invites?error=rate-limit");
  const tenant = await currentTenant();
  const result = await createInvite({
    tenantId: tenant.id,
    invitedBy: user,
    email: String(formData.get("email") || ""),
    name: String(formData.get("name") || ""),
    sendEmail: formData.get("sendEmail") === "on"
  });
  if (!result.ok) redirect("/settings/invites?error=quota");
  redirect(`/settings/invites?created=${encodeURIComponent(result.token)}&invite=${encodeURIComponent(result.invite.id)}#invite-${result.invite.id}`);
}

async function revokeInvite(formData: FormData) {
  "use server";
  await requireFeature("invites");
  const user = await currentUser();
  if (!user) redirect("/login");
  const tenant = await currentTenant();
  const id = String(formData.get("id") || "");
  await prisma.userInvite.updateMany({
    where: { id, tenantId: tenant.id, invitedById: user.id, status: "OPEN" },
    data: { status: "REVOKED" }
  });
  await logAction({
    actorId: user.id,
    action: "invite_revoked",
    entityType: "invite",
    entityId: id,
    title: "Einladung widerrufen",
    href: "/settings/invites"
  });
  redirect("/settings/invites");
}

async function deleteInvite(formData: FormData) {
  "use server";
  await requireFeature("invites");
  const user = await currentUser();
  if (!user) redirect("/login");
  const tenant = await currentTenant();
  const id = String(formData.get("id") || "");
  const invite = await prisma.userInvite.findFirst({ where: { id, tenantId: tenant.id, invitedById: user.id } });
  if (!invite) redirect("/settings/invites");
  await prisma.userInvite.delete({ where: { id: invite.id } });
  await logAction({
    actorId: user.id,
    action: "invite_deleted",
    entityType: "invite",
    entityId: invite.id,
    title: `Einladung gelöscht${invite.name || invite.email ? `: ${invite.name || invite.email}` : ""}`,
    details: { email: invite.email, name: invite.name, status: invite.status },
    href: "/settings/invites"
  });
  redirect("/settings/invites?deleted=1");
}

async function resendInviteMail(formData: FormData) {
  "use server";
  await requireFeature("invites");
  const user = await currentUser();
  if (!user) redirect("/login");
  const tenant = await currentTenant();
  const result = await resendInviteEmail({
    tenantId: tenant.id,
    inviteId: String(formData.get("id") || ""),
    actor: user
  });
  if (!result.ok) redirect(`/settings/invites?mail=${result.error}`);
  redirect(`/settings/invites?mail=${result.sent ? "sent" : "skipped"}`);
}

async function sendInviteTelegram(formData: FormData) {
  "use server";
  await requireFeature("invites");
  const user = await currentUser();
  if (!user) redirect("/login");
  const tenant = await currentTenant();
  const id = String(formData.get("id") || "");
  const chatId = String(formData.get("telegramChatId") || "");
  const [invite, chat] = await Promise.all([
    prisma.userInvite.findFirst({ where: { id, tenantId: tenant.id, invitedById: user.id, status: "OPEN" } }),
    prisma.telegramChat.findFirst({ where: { id: chatId, telegramSettings: { tenantId: tenant.id }, status: "ACTIVE" }, include: { telegramSettings: true } })
  ]);
  if (!invite || !chat?.telegramSettings?.telegramBotTokenEnc) redirect("/settings/invites?telegram=failed");
  const token = String(formData.get("token") || "");
  const url = token ? inviteUrl(token) : "";
  if (!url) redirect("/settings/invites?telegram=missing-token");
  const message = [
    "<b>Einladung</b>",
    `${telegramHtml(user.profile?.displayName || user.name || user.username || user.email)} hat eine Einladung erstellt.`,
    invite.name ? `Für: <b>${telegramHtml(invite.name)}</b>` : "",
    telegramLink(url, "Einladung annehmen")
  ].filter(Boolean).join("\n");
  await sendTelegramMessage(chat.telegramSettings.telegramBotTokenEnc, chat.chatId, chat.threadId, message, { parseMode: "HTML", disableWebPagePreview: true });
  await logAction({
    actorId: user.id,
    action: "invite_sent_telegram",
    entityType: "invite",
    entityId: invite.id,
    title: `Einladung per Telegram verschickt${invite.name ? `: ${invite.name}` : ""}`,
    details: { outputChatId: chat.id, chatId: chat.chatId, threadId: chat.threadId, chatTitle: chat.chatTitle, threadTitle: chat.threadTitle },
    href: "/settings/invites"
  });
  redirect(`/settings/invites?telegram=sent#invite-${invite.id}`);
}

export default async function InvitesPage(
  props: { searchParams?: Promise<{ created?: string; invite?: string; error?: string; telegram?: string; mail?: string; deleted?: string }> }
) {
  const searchParams = await props.searchParams;
  await requireFeature("invites");
  const user = await currentUser();
  if (!user) redirect("/login");
  const tenant = await currentTenant();
  const [usage, invites, activeChats] = await Promise.all([
    inviteUsage(user),
    prisma.userInvite.findMany({
      where: { tenantId: tenant.id, invitedById: user.id },
      include: { acceptedBy: { include: { profile: true } } },
      orderBy: { createdAt: "desc" }
    }),
    prisma.telegramChat.findMany({
      where: { telegramSettings: { tenantId: tenant.id }, status: "ACTIVE" },
      orderBy: [{ chatTitle: "asc" }, { threadTitle: "asc" }]
    })
  ]);
  const createdUrl = searchParams?.created ? inviteUrl(searchParams.created) : "";
  return (
    <AppShell>
      <PageHeader title="Einladungen" />
      <PageGuide title="Kontrolliertes Wachstum">
        Neue Benutzer können nur über einen Einladungslink dazukommen. Admins haben unbegrenzt Einladungen, normale Benutzer sehen hier ihr persönliches Kontingent.
      </PageGuide>
      {createdUrl ? (
        <Panel className="mb-6 border-redbrand bg-redbrand/10">
          <h2 className="mb-2 text-lg font-semibold text-ink">Neuer Einladungslink</h2>
          <code className="block overflow-x-auto rounded-md bg-surface p-3 text-sm text-ink">{createdUrl}</code>
          <p className="mt-2 text-sm text-graphite">Der Link wird nur jetzt mit Token angezeigt. In der Liste bleibt die Einladung sichtbar.</p>
        </Panel>
      ) : null}
      {searchParams?.error === "quota" ? <p className="mb-4 rounded-md bg-redbrand/10 p-3 text-sm font-semibold text-redbrand">Dein Einladungskontingent ist aufgebraucht.</p> : null}
      {searchParams?.telegram === "sent" ? <p className="mb-4 rounded-md bg-emerald-500/10 p-3 text-sm font-semibold text-emerald-700">Einladung wurde per Telegram verschickt.</p> : null}
      {searchParams?.mail === "sent" ? <p className="mb-4 rounded-md bg-emerald-500/10 p-3 text-sm font-semibold text-emerald-700">Einladungsmail wurde erneut an Postfix übergeben.</p> : null}
      {searchParams?.mail === "skipped" ? <p className="mb-4 rounded-md bg-paper p-3 text-sm font-semibold text-graphite">Einladungsmail wurde nicht gesendet. Prüfe E-Mail-System, Template und Empfängeradresse.</p> : null}
      {searchParams?.mail === "missing_email" ? <p className="mb-4 rounded-md bg-redbrand/10 p-3 text-sm font-semibold text-redbrand">Diese Einladung hat keine E-Mail-Adresse.</p> : null}
      {searchParams?.deleted ? <p className="mb-4 rounded-md bg-paper p-3 text-sm font-semibold text-graphite">Einladung gelöscht.</p> : null}
      <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <div className="space-y-6">
          <Panel>
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-redbrand text-white"><Ticket className="h-6 w-6" /></span>
              <div>
                <h2 className="text-lg font-semibold">Kontingent</h2>
                <p className="text-sm text-graphite">{usage.quota === null ? "Unbegrenzt" : `${usage.remaining} von ${usage.quota} übrig`}</p>
              </div>
            </div>
            <p className="text-sm leading-6 text-graphite">Benutzt oder offen: {usage.used}</p>
          </Panel>
          <Panel>
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold"><UserPlus className="h-5 w-5 text-redbrand" /> Einladung erstellen</h2>
            <form action={createInviteAction} className="space-y-4">
              <Field label="Name"><input className={inputClass} name="name" placeholder="Anna" /></Field>
              <Field label="E-Mail"><input className={inputClass} name="email" type="email" placeholder="optional" /></Field>
              <label className="flex items-center gap-2 rounded-md bg-paper p-3 text-sm text-graphite">
                <input name="sendEmail" type="checkbox" className="h-4 w-4 accent-redbrand" />
                E-Mail direkt versenden, falls eine Adresse eingetragen ist
              </label>
              <SubmitButton pendingLabel="Einladung wird erstellt..."><UserPlus className="h-4 w-4" /> Einladung erstellen</SubmitButton>
            </form>
          </Panel>
        </div>
        <Panel>
          <h2 className="mb-4 text-lg font-semibold">Meine Einladungen</h2>
          <div className="space-y-3">
            {invites.map((invite) => {
              const acceptedName = invite.acceptedBy ? invite.acceptedBy.profile?.displayName || invite.acceptedBy.name || invite.acceptedBy.username || invite.acceptedBy.email : "";
              return (
                <details key={invite.id} id={`invite-${invite.id}`} className="rounded-lg border border-line bg-paper">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
                    <span>
                      <strong className="block text-ink">{invite.name || invite.email || "Einladung"}</strong>
                      <span className="text-sm text-graphite">{invite.email || "ohne E-Mail"}</span>
                    </span>
                    <Badge tone={invite.status === "ACCEPTED" ? "green" : invite.status === "OPEN" ? "red" : "neutral"}>{inviteLabel(invite)}</Badge>
                  </summary>
                  <div className="space-y-3 border-t border-line p-4 text-sm text-graphite">
                    <p>Gültig bis {invite.expiresAt.toLocaleString("de-DE")}</p>
                    {acceptedName ? <p>Angenommen von <strong className="text-ink">{acceptedName}</strong></p> : null}
                    {invite.status === "OPEN" ? (
                      <div className="flex flex-wrap gap-2">
                        {createdUrl && searchParams?.invite === invite.id ? (
                          <a className="focus-ring inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-redbrand px-4 py-2 text-sm font-semibold text-white hover:bg-redbrandHover" href={createdUrl}>
                            <Copy className="h-4 w-4" /> Link öffnen
                          </a>
                        ) : null}
                        {activeChats.length && createdUrl && searchParams?.invite === invite.id ? (
                          <form action={sendInviteTelegram} className="flex flex-wrap gap-2">
                            <input type="hidden" name="id" value={invite.id} />
                            <input type="hidden" name="token" value={searchParams?.created || ""} />
                            <select className={selectClass} name="telegramChatId" required defaultValue="">
                              <option value="">Telegram-Ziel</option>
                              {activeChats.map((chat) => (
                                <option key={chat.id} value={chat.id}>{chat.threadTitle || "Hauptchat"} · {chat.chatTitle || chat.title || chat.chatId}</option>
                              ))}
                            </select>
                            <Button><Send className="h-4 w-4" /> Per Telegram senden</Button>
                          </form>
                        ) : null}
                        <form action={revokeInvite}>
                          <input type="hidden" name="id" value={invite.id} />
                          <Button variant="danger">Widerrufen</Button>
                        </form>
                        {invite.email ? (
                          <form action={resendInviteMail}>
                            <input type="hidden" name="id" value={invite.id} />
                            <Button><Mail className="h-4 w-4" /> Mail erneut senden</Button>
                          </form>
                        ) : null}
                        <form action={deleteInvite}>
                          <input type="hidden" name="id" value={invite.id} />
                          <Button variant="danger"><Trash2 className="h-4 w-4" /> Löschen</Button>
                        </form>
                      </div>
                    ) : (
                      <form action={deleteInvite}>
                        <input type="hidden" name="id" value={invite.id} />
                        <Button variant="danger"><Trash2 className="h-4 w-4" /> Löschen</Button>
                      </form>
                    )}
                  </div>
                </details>
              );
            })}
            {!invites.length ? <p className="rounded-md border border-dashed border-line bg-paper p-4 text-sm text-graphite">Noch keine Einladungen erstellt.</p> : null}
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}
