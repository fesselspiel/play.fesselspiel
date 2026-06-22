import { redirect } from "next/navigation";
import { BellRing, Mail, Save, Send, Settings2, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { SubmitButton } from "@/components/submit-button";
import { TemplateVariableTextarea } from "@/components/template-variable-textarea";
import { NotificationTargetFields } from "@/components/telegram/notification-target-fields";
import { Badge, Button, Field, inputClass, PageGuide, PageHeader, Panel, selectClass } from "@/components/ui";
import { defaultEmailTemplates, ensureEmailSetup, sendTemplateEmail } from "@/lib/email";
import { currentAdminOrRedirect, currentSessionContext, requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/dates";
import { env } from "@/lib/env";
import { requireFeature } from "@/lib/features";
import { testEmailNotificationRule } from "@/lib/email-notifications";
import { actionLabel, knownAuditActions } from "@/lib/notification-actions";

const emailTemplateVariables = [
  { token: "{{userName}}", label: "Benutzername" },
  { token: "{{loginIdentifier}}", label: "Login" },
  { token: "{{appUrl}}", label: "Portal-Link" },
  { token: "{{profileUrl}}", label: "Profil-Link" },
  { token: "{{loginTime}}", label: "Login-Zeit" },
  { token: "{{confirmUrl}}", label: "Bestätigungslink" },
  { token: "{{resetUrl}}", label: "Reset-Link" },
  { token: "{{title}}", label: "Titel" },
  { token: "{{actor}}", label: "Auslöser" },
  { token: "{{event}}", label: "Event" },
  { token: "{{url}}", label: "Aktionslink" },
  { token: "{{details}}", label: "Details" }
];

type TargetUser = {
  id: string;
  email: string;
  name: string | null;
  username: string | null;
  profile: { displayName: string | null } | null;
};

function userLabel(user: TargetUser) {
  return user.profile?.displayName || user.name || user.username || user.email;
}

async function readTargetData(admin: Awaited<ReturnType<typeof requireAdmin>>, formData: FormData) {
  const targetType = String(formData.get("targetType") || "none");
  if (targetType === "user") {
    const targetUserId = String(formData.get("targetUserId") || "");
    const targetUser = targetUserId
      ? await prisma.user.findFirst({
          where: {
            id: targetUserId,
            active: true,
            ...(admin.role === "ADMIN" || admin.role === "SUPER_ADMIN" ? {} : { id: admin.id })
          },
          select: { id: true }
        })
      : null;
    return { targetUserId: targetUser?.id || null, targetCircleId: null };
  }
  if (targetType === "circle") {
    const targetCircleId = String(formData.get("targetCircleId") || "");
    const targetCircle = targetCircleId
      ? await prisma.circle.findFirst({
          where: {
            id: targetCircleId,
            ...(admin.role === "ADMIN" || admin.role === "SUPER_ADMIN" ? {} : admin.circleId ? { id: admin.circleId } : { id: "__none__" })
          },
          select: { id: true }
        })
      : null;
    return { targetUserId: null, targetCircleId: targetCircle?.id || null };
  }
  return { targetUserId: null, targetCircleId: null };
}

function targetTypeFor(rule: { targetUserId: string | null; targetCircleId: string | null }) {
  if (rule.targetUserId) return "user";
  if (rule.targetCircleId) return "circle";
  return "none";
}

async function saveEmailSettings(formData: FormData) {
  "use server";
  await requireAdmin();
  await requireFeature("email");
  await ensureEmailSetup();
  await prisma.emailSettings.update({
    where: { id: "system" },
    data: {
      enabled: formData.get("enabled") === "on",
      fromName: String(formData.get("fromName") || "Fesselspiel").trim(),
      fromEmail: String(formData.get("fromEmail") || "no-reply@playplaner.com").trim(),
      smtpHost: String(formData.get("smtpHost") || env.emailSmtpHost).trim(),
      smtpPort: Number(formData.get("smtpPort") || env.emailSmtpPort) || 25
    }
  });
  redirect("/settings/email?saved=settings");
}

async function saveEmailTemplate(formData: FormData) {
  "use server";
  await requireAdmin();
  await requireFeature("email");
  await ensureEmailSetup();
  const key = String(formData.get("key") || "");
  await prisma.emailTemplate.update({
    where: { key },
    data: {
      enabled: formData.get("enabled") === "on",
      subject: String(formData.get("subject") || "").trim(),
      body: String(formData.get("body") || "").trim()
    }
  });
  redirect(`/settings/email?saved=template#template-${key}`);
}

async function sendTestEmail(formData: FormData) {
  "use server";
  await requireAdmin();
  await requireFeature("email");
  await ensureEmailSetup();
  const to = String(formData.get("to") || "").trim();
  if (!to) redirect("/settings/email?error=missing-test-recipient");
  const templateKey = String(formData.get("templateKey") || "").trim();
  const template = templateKey ? await prisma.emailTemplate.findUnique({ where: { key: templateKey } }) : null;
  if (!template) redirect("/settings/email?error=missing-test-template");
  const result = await sendTemplateEmail({
    key: template.key,
    to,
    variables: {
      userName: "Testbenutzer",
      loginIdentifier: "test",
      appUrl: env.appUrl,
      profileUrl: `${env.appUrl}/profile`,
      loginTime: formatDateTime(new Date()),
      confirmUrl: `${env.appUrl}/email/confirm?token=test`,
      resetUrl: `${env.appUrl}/password/reset?token=test`
    }
  });
  redirect(`/settings/email?test=${result.sent ? "sent" : "skipped"}&template=${encodeURIComponent(template.title)}`);
}

async function createEmailNotificationRule(formData: FormData) {
  "use server";
  const admin = await requireAdmin();
  await requireFeature("email");
  const action = String(formData.get("action") || "").trim();
  const templateKey = String(formData.get("templateKey") || "").trim();
  const template = templateKey ? await prisma.emailTemplate.findUnique({ where: { key: templateKey } }) : null;
  const targetData = await readTargetData(admin, formData);
  if (!action || !template || (!targetData.targetUserId && !targetData.targetCircleId)) redirect("/settings/email#notifications");
  await prisma.emailNotificationRule.create({
    data: {
      action,
      templateKey: template.key,
      ...targetData
    }
  });
  redirect("/settings/email#notifications");
}

async function updateEmailNotificationRule(formData: FormData) {
  "use server";
  const admin = await requireAdmin();
  await requireFeature("email");
  const id = String(formData.get("ruleId") || "");
  const action = String(formData.get("action") || "").trim();
  const templateKey = String(formData.get("templateKey") || "").trim();
  const template = templateKey ? await prisma.emailTemplate.findUnique({ where: { key: templateKey } }) : null;
  const targetData = await readTargetData(admin, formData);
  if (!id || !action || !template || (!targetData.targetUserId && !targetData.targetCircleId)) redirect("/settings/email#notifications");
  await prisma.emailNotificationRule.update({
    where: { id },
    data: {
      action,
      templateKey: template.key,
      active: formData.get("active") === "on",
      ...targetData
    }
  });
  redirect("/settings/email#notifications");
}

async function deleteEmailNotificationRule(formData: FormData) {
  "use server";
  await requireAdmin();
  await requireFeature("email");
  await prisma.emailNotificationRule.deleteMany({ where: { id: String(formData.get("ruleId") || "") } });
  redirect("/settings/email#notifications");
}

async function testEmailRule(formData: FormData) {
  "use server";
  const admin = await requireAdmin();
  await requireFeature("email");
  const result = await testEmailNotificationRule(String(formData.get("ruleId") || ""), admin.id);
  redirect(`/settings/email?ruleTestSent=${result.sent}&ruleTestFailed=${result.failed}#notifications`);
}

export default async function EmailSettingsPage({ searchParams }: { searchParams?: { saved?: string; test?: string; template?: string; error?: string; action?: string; ruleTestSent?: string; ruleTestFailed?: string } }) {
  const admin = await currentAdminOrRedirect();
  await requireFeature("email");
  const { tenant } = await currentSessionContext();
  if (!tenant) redirect("/");
  await ensureEmailSetup();
  const [settings, templates, logs, memberships, circles, auditActions, notificationRules] = await Promise.all([
    prisma.emailSettings.findUnique({ where: { id: "system" } }),
    prisma.emailTemplate.findMany({ orderBy: { title: "asc" } }),
    prisma.emailLog.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.tenantMembership.findMany({ where: { tenantId: tenant.id, active: true, user: { active: true } }, include: { user: { include: { profile: true } } }, orderBy: { createdAt: "asc" } }),
    prisma.circle.findMany({ where: { tenantId: tenant.id }, orderBy: { name: "asc" } }),
    prisma.auditLog.findMany({ distinct: ["action"], select: { action: true }, orderBy: { action: "asc" } }),
    prisma.emailNotificationRule.findMany({
      include: { targetUser: { include: { profile: true } }, targetCircle: true, template: true },
      orderBy: [{ active: "desc" }, { action: "asc" }]
    })
  ]);
  const users = memberships.map((membership) => membership.user);
  const knownTemplateKeys = new Set<string>(defaultEmailTemplates.map((template) => template.key));
  const defaultTestTemplate = templates.find((template) => template.key === "user_created") || templates[0];
  const testTemplateLabel = searchParams?.template || null;
  const targetUsers = users.map((entry) => ({ id: entry.id, label: userLabel(entry) }));
  const requestedAction = String(searchParams?.action || "").trim();
  const actionOptions = Array.from(new Set([...knownAuditActions.map(([action]) => action), ...auditActions.map((entry) => entry.action), requestedAction].filter(Boolean))).sort((a, b) => actionLabel(a).localeCompare(actionLabel(b)));
  return (
    <AppShell>
      <PageHeader title="E-Mail" subtitle="Postfix, Systemmails und Templates kontrolliert verwalten." />
      <PageGuide title="E-Mail-System">
        Diese Admin-Seite steuert den internen Postfix-Versand. Erst wenn das System aktiv ist und die jeweilige Vorlage aktiv ist, sendet die App E-Mails.
      </PageGuide>

      {searchParams?.saved ? <div className="mb-4 rounded-md border border-line bg-paper px-4 py-3 text-sm font-semibold text-graphite">Gespeichert.</div> : null}
      {searchParams?.test === "sent" ? <div className="mb-4 rounded-md border border-emerald-500 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-700">Testmail wurde an Postfix übergeben{testTemplateLabel ? `: ${testTemplateLabel}` : ""}.</div> : null}
      {searchParams?.test === "skipped" ? <div className="mb-4 rounded-md border border-line bg-paper px-4 py-3 text-sm font-semibold text-graphite">Testmail wurde nicht gesendet{testTemplateLabel ? `: ${testTemplateLabel}` : ""}. Prüfe System- und Template-Schalter.</div> : null}
      {searchParams?.error ? <div className="mb-4 rounded-md border border-redbrand bg-redbrand/10 px-4 py-3 text-sm font-semibold text-redbrand">{searchParams.error === "missing-test-template" ? "Bitte eine gültige Vorlage auswählen." : "Bitte eine Empfängeradresse angeben."}</div> : null}

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <div className="space-y-6">
          <Panel className="p-0">
            <details open>
              <summary className="focus-ring flex min-h-14 cursor-pointer list-none items-center gap-2 px-5 py-4 text-lg font-semibold [&::-webkit-details-marker]:hidden">
                <Settings2 className="h-5 w-5 text-redbrand" /> Postfix & Absender
              </summary>
              <form action={saveEmailSettings} className="space-y-4 border-t border-line p-5">
              <label className="flex items-center justify-between gap-3 rounded-md border border-line bg-paper px-3 py-2 text-sm font-semibold">
                E-Mail-System aktiv
                <input name="enabled" type="checkbox" defaultChecked={Boolean(settings?.enabled)} className="h-5 w-5 accent-redbrand" />
              </label>
              <Field label="Absendername"><input className={inputClass} name="fromName" defaultValue={settings?.fromName || "Fesselspiel"} /></Field>
              <Field label="Absenderadresse"><input className={inputClass} name="fromEmail" type="email" defaultValue={settings?.fromEmail || "no-reply@playplaner.com"} /></Field>
              <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
                <Field label="SMTP Host"><input className={inputClass} name="smtpHost" defaultValue={settings?.smtpHost || env.emailSmtpHost} /></Field>
                <Field label="Port"><input className={inputClass} name="smtpPort" type="number" defaultValue={settings?.smtpPort || env.emailSmtpPort} /></Field>
              </div>
              <SubmitButton pendingLabel="E-Mail-System wird gespeichert...">Einstellungen speichern</SubmitButton>
            </form>
            </details>
          </Panel>

          <Panel className="p-0">
            <details open>
              <summary className="focus-ring flex min-h-14 cursor-pointer list-none items-center gap-2 px-5 py-4 text-lg font-semibold [&::-webkit-details-marker]:hidden">
                <Send className="h-5 w-5 text-redbrand" /> Testmail
              </summary>
              <form action={sendTestEmail} className="space-y-4 border-t border-line p-5">
              <Field label="Empfänger"><input className={inputClass} name="to" type="email" defaultValue={admin.email} placeholder="name@example.com" /></Field>
              <Field label="Vorlage">
                <select className={selectClass} name="templateKey" defaultValue={defaultTestTemplate?.key || ""} required>
                  {templates.map((template) => <option key={template.id} value={template.key}>{template.title}</option>)}
                </select>
              </Field>
              <p className="text-sm leading-6 text-graphite">Die Testmail nutzt die ausgewählte Vorlage und respektiert den System- und Template-Schalter.</p>
              <SubmitButton pendingLabel="Testmail wird gesendet...">Testmail senden</SubmitButton>
            </form>
            </details>
          </Panel>

          <Panel className="p-0" id="notifications">
            <details>
              <summary className="focus-ring flex min-h-14 cursor-pointer list-none items-center gap-2 px-5 py-4 text-lg font-semibold [&::-webkit-details-marker]:hidden">
                <BellRing className="h-5 w-5 text-redbrand" /> Aktions-E-Mails
              </summary>
              <div className="space-y-4 border-t border-line p-5">
                <p className="text-sm leading-6 text-graphite">Sende bei protokollierten Aktionen automatisch eine E-Mail an einen Benutzer oder einen ganzen Kreis.</p>
                {searchParams?.ruleTestSent ? (
                  <div className="rounded-md border border-line bg-paper p-3 text-sm text-graphite">
                    Test ausgelöst: <strong className="text-ink">{searchParams.ruleTestSent}</strong>
                    {Number(searchParams.ruleTestFailed || 0) ? <span className="ml-2 text-redbrand">Fehler: {searchParams.ruleTestFailed}</span> : null}
                  </div>
                ) : null}
                <form action={createEmailNotificationRule} className="space-y-4 rounded-md border border-line bg-paper p-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Aktion">
                      <select className={selectClass} name="action" defaultValue={requestedAction || actionOptions[0] || ""} required>
                        {actionOptions.map((action) => <option key={action} value={action}>{actionLabel(action)}</option>)}
                      </select>
                    </Field>
                    <Field label="E-Mail-Vorlage">
                      <select className={selectClass} name="templateKey" defaultValue={defaultTestTemplate?.key || ""} required>
                        {templates.map((template) => <option key={template.id} value={template.key}>{template.title}</option>)}
                      </select>
                    </Field>
                    <NotificationTargetFields users={targetUsers} circles={circles} targetType="none" />
                  </div>
                  <SubmitButton pendingLabel="Regel wird gespeichert..."><Save className="h-4 w-4" /> Regel anlegen</SubmitButton>
                </form>
                <div className="space-y-3">
                  {notificationRules.map((rule) => (
                    <details key={rule.id} className="rounded-md border border-line bg-paper p-3">
                      <summary className="flex cursor-pointer list-none items-start justify-between gap-3 [&::-webkit-details-marker]:hidden">
                        <span className="min-w-0">
                          <strong className="block truncate">{actionLabel(rule.action)}</strong>
                          <span className="mt-1 block text-sm text-graphite">
                            Ziel: {rule.targetCircle ? `Kreis ${rule.targetCircle.name}` : rule.targetUser ? userLabel(rule.targetUser) : "-"}
                          </span>
                          <span className="mt-1 block text-sm text-graphite">Vorlage: {rule.template?.title || rule.templateKey}</span>
                        </span>
                        <Badge tone={rule.active ? "green" : "neutral"}>{rule.active ? "aktiv" : "inaktiv"}</Badge>
                      </summary>
                      <form action={updateEmailNotificationRule} className="mt-4 space-y-4 border-t border-line pt-4">
                        <input type="hidden" name="ruleId" value={rule.id} />
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Field label="Aktion">
                            <select className={selectClass} name="action" defaultValue={rule.action} required>
                              {actionOptions.map((action) => <option key={action} value={action}>{actionLabel(action)}</option>)}
                            </select>
                          </Field>
                          <Field label="E-Mail-Vorlage">
                            <select className={selectClass} name="templateKey" defaultValue={rule.templateKey} required>
                              {templates.map((template) => <option key={template.id} value={template.key}>{template.title}</option>)}
                            </select>
                          </Field>
                          <NotificationTargetFields users={targetUsers} circles={circles} targetType={targetTypeFor(rule)} targetUserId={rule.targetUserId} targetCircleId={rule.targetCircleId} />
                        </div>
                        <label className="flex items-center gap-2 text-sm text-graphite">
                          <input name="active" type="checkbox" defaultChecked={rule.active} className="h-4 w-4 accent-redbrand" />
                          aktiv
                        </label>
                        <SubmitButton pendingLabel="Regel wird gespeichert..."><Save className="h-4 w-4" /> Regel speichern</SubmitButton>
                      </form>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <form action={testEmailRule}>
                          <input type="hidden" name="ruleId" value={rule.id} />
                          <Button><Send className="h-4 w-4" /> Test senden</Button>
                        </form>
                        <form action={deleteEmailNotificationRule}>
                          <input type="hidden" name="ruleId" value={rule.id} />
                          <Button variant="danger"><Trash2 className="h-4 w-4" /> Regel löschen</Button>
                        </form>
                      </div>
                    </details>
                  ))}
                  {!notificationRules.length ? <p className="rounded-md border border-dashed border-line bg-paper p-4 text-sm text-graphite">Noch keine aktionsbasierten E-Mail-Regeln angelegt.</p> : null}
                </div>
              </div>
            </details>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel className="p-0">
            <details open>
              <summary className="focus-ring flex min-h-14 cursor-pointer list-none items-center gap-2 px-5 py-4 text-lg font-semibold [&::-webkit-details-marker]:hidden">
                <Mail className="h-5 w-5 text-redbrand" /> Templates
              </summary>
              <div className="space-y-3 border-t border-line p-5">
              {templates.map((template) => (
                <details key={template.id} id={`template-${template.key}`} className="overflow-hidden rounded-md border border-line bg-paper">
                  <summary className="focus-ring flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold hover:bg-surface [&::-webkit-details-marker]:hidden">
                    <span>
                      {template.title}
                      <span className="ml-2 text-xs font-medium text-graphite">{template.key}</span>
                    </span>
                    <Badge tone={template.enabled ? "green" : "neutral"}>{template.enabled ? "aktiv" : "aus"}</Badge>
                  </summary>
                  <form action={saveEmailTemplate} className="space-y-4 border-t border-line bg-surface p-3">
                    <input type="hidden" name="key" value={template.key} />
                    <label className="flex items-center gap-2 text-sm font-semibold">
                      <input name="enabled" type="checkbox" defaultChecked={template.enabled} className="h-4 w-4 accent-redbrand" />
                      Vorlage aktiv
                    </label>
                    <Field label="Betreff"><input className={inputClass} name="subject" defaultValue={template.subject} /></Field>
                    <TemplateVariableTextarea
                      label="Textvorlage"
                      name="body"
                      rows={9}
                      defaultValue={template.body}
                      variables={emailTemplateVariables}
                      textareaClassName="min-h-56 font-mono text-xs leading-5"
                    />
                    {!knownTemplateKeys.has(template.key) ? <div className="rounded-md bg-paper p-3 text-xs leading-5 text-graphite">Dieses Template ist nicht in den App-Defaults enthalten.</div> : null}
                    <Button>Template speichern</Button>
                  </form>
                </details>
              ))}
            </div>
            </details>
          </Panel>

          <Panel className="p-0">
            <details>
              <summary className="focus-ring flex min-h-14 cursor-pointer list-none items-center px-5 py-4 text-lg font-semibold [&::-webkit-details-marker]:hidden">
                Versandprotokoll
              </summary>
              <div className="space-y-2 border-t border-line p-5">
              {logs.map((log) => (
                <div key={log.id} className="rounded-md border border-line bg-paper p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong>{log.subject}</strong>
                    <Badge tone={log.status === "SENT" ? "green" : log.status === "FAILED" ? "red" : "neutral"}>{log.status}</Badge>
                  </div>
                  <div className="mt-1 text-xs text-graphite">{log.recipient} · {log.templateKey || "ohne Template"} · {formatDateTime(log.createdAt)}</div>
                  {log.error ? <pre className="mt-2 whitespace-pre-wrap rounded-md bg-surface p-2 text-xs text-redbrand">{log.error}</pre> : null}
                </div>
              ))}
              {!logs.length ? <p className="rounded-md border border-dashed border-line bg-paper p-4 text-sm text-graphite">Noch keine E-Mails protokolliert.</p> : null}
            </div>
            </details>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
