import { redirect } from "next/navigation";
import { ChevronDown, MessageCircle, Save, Send, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { SubmitButton } from "@/components/submit-button";
import { TemplateVariableTextarea } from "@/components/template-variable-textarea";
import { Badge, Button, Field, PageGuide, PageHeader, Panel, selectClass } from "@/components/ui";
import { currentSessionContext } from "@/lib/auth";
import { testChatNotificationRule } from "@/lib/chat-notifications";
import { actionLabel, notificationActionOptions } from "@/lib/notification-actions";
import { prisma } from "@/lib/prisma";
import { requireFeature } from "@/lib/features";

const chatTemplateVariables = [
  { token: "{title}", label: "Titel" },
  { token: "{actor}", label: "Auslöser" },
  { token: "{event}", label: "Event" },
  { token: "{action}", label: "Aktion" },
  { token: "{url}", label: "Link" },
  { token: "{entityType}", label: "Objektart" },
  { token: "{entityId}", label: "Objekt-ID" },
  { token: "{details}", label: "Details" }
];

const defaultChatTemplate = "{actor}: {event}\n{title}\n{url}";

async function requireChatAdmin() {
  const { actor, tenant } = await currentSessionContext();
  if (!actor) redirect("/login");
  if (actor.role !== "ADMIN" && actor.role !== "SUPER_ADMIN") redirect("/");
  if (!tenant) redirect("/");
  await requireFeature("circleChat");
  return { actor, tenant };
}

async function createChatNotificationRule(formData: FormData) {
  "use server";
  const { tenant } = await requireChatAdmin();
  const action = String(formData.get("action") || "").trim();
  const targetCircleId = String(formData.get("targetCircleId") || "").trim();
  const message = String(formData.get("message") || defaultChatTemplate).trim() || defaultChatTemplate;
  const circle = targetCircleId ? await prisma.circle.findFirst({ where: { id: targetCircleId, tenantId: tenant.id }, select: { id: true } }) : null;
  if (!action || !circle) redirect("/settings/chat#notifications");
  await prisma.chatNotificationRule.create({
    data: {
      tenantId: tenant.id,
      action,
      targetCircleId: circle.id,
      message,
      active: formData.get("active") !== "off"
    }
  });
  redirect("/settings/chat?saved=created#notifications");
}

async function updateChatNotificationRule(formData: FormData) {
  "use server";
  const { tenant } = await requireChatAdmin();
  const id = String(formData.get("ruleId") || "");
  const action = String(formData.get("action") || "").trim();
  const targetCircleId = String(formData.get("targetCircleId") || "").trim();
  const message = String(formData.get("message") || defaultChatTemplate).trim() || defaultChatTemplate;
  const circle = targetCircleId ? await prisma.circle.findFirst({ where: { id: targetCircleId, tenantId: tenant.id }, select: { id: true } }) : null;
  if (!id || !action || !circle) redirect("/settings/chat#notifications");
  await prisma.chatNotificationRule.updateMany({
    where: { id, tenantId: tenant.id },
    data: {
      action,
      targetCircleId: circle.id,
      message,
      active: formData.get("active") === "on"
    }
  });
  redirect("/settings/chat?saved=updated#notifications");
}

async function deleteChatNotificationRule(formData: FormData) {
  "use server";
  const { tenant } = await requireChatAdmin();
  await prisma.chatNotificationRule.deleteMany({ where: { id: String(formData.get("ruleId") || ""), tenantId: tenant.id } });
  redirect("/settings/chat?saved=deleted#notifications");
}

async function testChatNotificationRuleAction(formData: FormData) {
  "use server";
  const { actor, tenant } = await requireChatAdmin();
  const rule = await prisma.chatNotificationRule.findFirst({ where: { id: String(formData.get("ruleId") || ""), tenantId: tenant.id }, select: { id: true } });
  if (!rule) redirect("/settings/chat#notifications");
  const result = await testChatNotificationRule(rule.id, actor.id);
  const params = new URLSearchParams({
    ruleTest: result.error || "done",
    ruleSent: String(result.sent),
    ruleFailed: String(result.failed)
  });
  redirect(`/settings/chat?${params.toString()}#notifications`);
}

export default async function ChatSettingsPage(
  props: { searchParams: Promise<{ action?: string; saved?: string; ruleTest?: string; ruleSent?: string; ruleFailed?: string }> }
) {
  const searchParams = await props.searchParams;
  const { tenant } = await requireChatAdmin();
  const requestedAction = String(searchParams.action || "").trim();
  const [circles, rules, auditActions] = await Promise.all([
    prisma.circle.findMany({ where: { tenantId: tenant.id }, orderBy: { name: "asc" } }),
    prisma.chatNotificationRule.findMany({
      where: { tenantId: tenant.id },
      include: { targetCircle: true },
      orderBy: [{ active: "desc" }, { updatedAt: "desc" }]
    }),
    prisma.auditLog.findMany({ where: { actor: { tenantId: tenant.id } }, distinct: ["action"], select: { action: true }, take: 300, orderBy: { createdAt: "desc" } })
  ]);
  const actionOptions = await notificationActionOptions({
    tenantId: tenant.id,
    auditActions: [...auditActions.map((entry) => entry.action), ...rules.map((rule) => rule.action)],
    requestedAction
  });
  const ruleTestText = searchParams.ruleTest
    ? searchParams.ruleTest === "missing_rule"
      ? "Regeltest nicht gesendet: Regel wurde nicht gefunden."
      : `Regeltest abgeschlossen: ${searchParams.ruleSent || 0} Chatnachricht erstellt, ${searchParams.ruleFailed || 0} fehlgeschlagen.`
    : "";

  return (
    <AppShell>
      <PageHeader title="Chat-Ereignisse" subtitle="Protokollaktionen automatisch als echte Nachrichten in Zirkel-Chats schreiben." />
      <PageGuide title="Chat-Ereignisse">
        Lege fest, welche Aktion als Chatnachricht in welchem Zirkel erscheinen soll. Die erzeugte Nachricht ist eine normale Chatnachricht und löst daher auch die vorhandenen Chat-Pushnachrichten aus.
      </PageGuide>
      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <div className="space-y-6">
          <Panel className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-paper text-redbrand"><MessageCircle className="h-5 w-5" /></span>
              <div>
                <h2 className="font-semibold text-ink">Chat-Brücke</h2>
                <p className="text-sm text-graphite">{rules.length} Regeln · {circles.length} Zirkel</p>
              </div>
            </div>
            <Badge tone={rules.some((rule) => rule.active) ? "green" : "neutral"}>{rules.some((rule) => rule.active) ? "aktiv" : "inaktiv"}</Badge>
          </Panel>

          <Panel className="p-0" id="notifications">
            <details open>
              <summary className="focus-ring flex min-h-14 cursor-pointer list-none items-center gap-2 px-5 py-4 text-lg font-semibold [&::-webkit-details-marker]:hidden">
                <ChevronDown className="h-5 w-5 text-redbrand" /> Neue Chat-Regel
              </summary>
              <div className="space-y-4 border-t border-line p-5">
                {searchParams.saved ? <p className="rounded-md border border-line bg-paper p-3 text-sm font-semibold text-graphite">Chat-Regel gespeichert.</p> : null}
                {ruleTestText ? <p className="rounded-md border border-line bg-paper p-3 text-sm font-semibold text-graphite">{ruleTestText}</p> : null}
                <form action={createChatNotificationRule} className="space-y-4">
                  <Field label="Aktion">
                    <select className={selectClass} name="action" defaultValue={requestedAction || actionOptions[0]?.action || ""} required>
                      {actionOptions.map((option) => <option key={option.action} value={option.action}>{option.label}</option>)}
                    </select>
                  </Field>
                  <Field label="Zielzirkel">
                    <select className={selectClass} name="targetCircleId" defaultValue={circles[0]?.id || ""} required>
                      {circles.map((circle) => <option key={circle.id} value={circle.id}>{circle.name}</option>)}
                    </select>
                  </Field>
                  <TemplateVariableTextarea label="Chatnachricht" name="message" rows={5} defaultValue={defaultChatTemplate} variables={chatTemplateVariables} required />
                  <label className="flex items-center gap-2 text-sm text-graphite">
                    <input name="active" type="checkbox" defaultChecked className="h-4 w-4 accent-redbrand" />
                    aktiv
                  </label>
                  <SubmitButton pendingLabel="Regel wird gespeichert..."><Save className="h-4 w-4" /> Regel anlegen</SubmitButton>
                </form>
              </div>
            </details>
          </Panel>
        </div>

        <Panel className="p-0">
          <details open>
            <summary className="focus-ring flex min-h-14 cursor-pointer list-none items-center gap-2 px-5 py-4 text-lg font-semibold [&::-webkit-details-marker]:hidden">
              <ChevronDown className="h-5 w-5 text-redbrand" /> Vorhandene Regeln
            </summary>
            <div className="space-y-3 border-t border-line p-5">
              {rules.map((rule) => (
                <details key={rule.id} className="rounded-md border border-line bg-paper p-3">
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-3 [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0">
                      <strong className="block truncate text-ink">{actionLabel(rule.action)}</strong>
                      <span className="mt-1 block text-sm text-graphite">Ziel: {rule.targetCircle.name}</span>
                      <span className="mt-1 block whitespace-pre-wrap text-sm text-graphite">{rule.message}</span>
                    </span>
                    <Badge tone={rule.active ? "green" : "neutral"}>{rule.active ? "aktiv" : "inaktiv"}</Badge>
                  </summary>
                  <form action={updateChatNotificationRule} className="mt-4 space-y-4 border-t border-line pt-4">
                    <input type="hidden" name="ruleId" value={rule.id} />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Aktion">
                        <select className={selectClass} name="action" defaultValue={rule.action} required>
                          {actionOptions.map((option) => <option key={option.action} value={option.action}>{option.label}</option>)}
                        </select>
                      </Field>
                      <Field label="Zielzirkel">
                        <select className={selectClass} name="targetCircleId" defaultValue={rule.targetCircleId} required>
                          {circles.map((circle) => <option key={circle.id} value={circle.id}>{circle.name}</option>)}
                        </select>
                      </Field>
                    </div>
                    <TemplateVariableTextarea label="Chatnachricht" name="message" rows={5} defaultValue={rule.message} variables={chatTemplateVariables} required />
                    <label className="flex items-center gap-2 text-sm text-graphite">
                      <input name="active" type="checkbox" defaultChecked={rule.active} className="h-4 w-4 accent-redbrand" />
                      aktiv
                    </label>
                    <SubmitButton pendingLabel="Regel wird gespeichert..."><Save className="h-4 w-4" /> Regel speichern</SubmitButton>
                  </form>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <form action={testChatNotificationRuleAction}>
                      <input type="hidden" name="ruleId" value={rule.id} />
                      <Button><Send className="h-4 w-4" /> Test in Chat schreiben</Button>
                    </form>
                    <form action={deleteChatNotificationRule}>
                      <input type="hidden" name="ruleId" value={rule.id} />
                      <Button variant="danger"><Trash2 className="h-4 w-4" /> Regel löschen</Button>
                    </form>
                  </div>
                </details>
              ))}
              {!rules.length ? <p className="rounded-md border border-dashed border-line bg-paper p-4 text-sm text-graphite">Noch keine Chat-Regeln angelegt.</p> : null}
            </div>
          </details>
        </Panel>
      </div>
    </AppShell>
  );
}
