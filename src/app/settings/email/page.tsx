import { redirect } from "next/navigation";
import { Mail, Send, Settings2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Button, Field, inputClass, PageGuide, PageHeader, Panel } from "@/components/ui";
import { defaultEmailTemplates, ensureEmailSetup, sendTemplateEmail } from "@/lib/email";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/dates";
import { env } from "@/lib/env";
import { requireFeature } from "@/lib/features";

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
  const to = String(formData.get("to") || "").trim();
  if (!to) redirect("/settings/email?error=missing-test-recipient");
  const result = await sendTemplateEmail({
    key: "user_created",
    to,
    variables: {
      userName: "Testbenutzer",
      loginIdentifier: "test",
      appUrl: env.appUrl,
      profileUrl: `${env.appUrl}/profile`,
      loginTime: formatDateTime(new Date())
    }
  });
  redirect(`/settings/email?test=${result.sent ? "sent" : "skipped"}`);
}

export default async function EmailSettingsPage({ searchParams }: { searchParams?: { saved?: string; test?: string; error?: string } }) {
  await requireFeature("email");
  await requireAdmin();
  await ensureEmailSetup();
  const [settings, templates, logs] = await Promise.all([
    prisma.emailSettings.findUnique({ where: { id: "system" } }),
    prisma.emailTemplate.findMany({ orderBy: { title: "asc" } }),
    prisma.emailLog.findMany({ orderBy: { createdAt: "desc" }, take: 30 })
  ]);
  const knownTemplateKeys = new Set<string>(defaultEmailTemplates.map((template) => template.key));
  return (
    <AppShell>
      <PageHeader title="E-Mail" subtitle="Postfix, Systemmails und Templates kontrolliert verwalten." />
      <PageGuide title="E-Mail-System">
        Diese Admin-Seite steuert den internen Postfix-Versand. Erst wenn das System aktiv ist und die jeweilige Vorlage aktiv ist, sendet die App E-Mails.
      </PageGuide>

      {searchParams?.saved ? <div className="mb-4 rounded-md border border-line bg-paper px-4 py-3 text-sm font-semibold text-graphite">Gespeichert.</div> : null}
      {searchParams?.test === "sent" ? <div className="mb-4 rounded-md border border-emerald-500 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-700">Testmail wurde an Postfix übergeben.</div> : null}
      {searchParams?.test === "skipped" ? <div className="mb-4 rounded-md border border-line bg-paper px-4 py-3 text-sm font-semibold text-graphite">Testmail wurde nicht gesendet. Prüfe System- und Template-Schalter.</div> : null}
      {searchParams?.error ? <div className="mb-4 rounded-md border border-redbrand bg-redbrand/10 px-4 py-3 text-sm font-semibold text-redbrand">Bitte eine Empfängeradresse angeben.</div> : null}

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <div className="space-y-6">
          <Panel>
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold"><Settings2 className="h-5 w-5 text-redbrand" /> Postfix & Absender</h2>
            <form action={saveEmailSettings} className="space-y-4">
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
          </Panel>

          <Panel>
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold"><Send className="h-5 w-5 text-redbrand" /> Testmail</h2>
            <form action={sendTestEmail} className="space-y-4">
              <Field label="Empfänger"><input className={inputClass} name="to" type="email" placeholder="name@example.com" /></Field>
              <p className="text-sm leading-6 text-graphite">Verwendet die Vorlage „Neues Benutzerkonto“. Auch der Test respektiert den System- und Template-Schalter.</p>
              <SubmitButton pendingLabel="Testmail wird gesendet...">Testmail senden</SubmitButton>
            </form>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel>
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold"><Mail className="h-5 w-5 text-redbrand" /> Templates</h2>
            <div className="space-y-3">
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
                    <Field label="Textvorlage">
                      <textarea className={`${inputClass} min-h-56 font-mono text-xs leading-5`} name="body" defaultValue={template.body} />
                    </Field>
                    <div className="rounded-md bg-paper p-3 text-xs leading-5 text-graphite">
                      Variablen: <code>{"{{userName}}"}</code>, <code>{"{{loginIdentifier}}"}</code>, <code>{"{{appUrl}}"}</code>, <code>{"{{profileUrl}}"}</code>, <code>{"{{loginTime}}"}</code>
                      {!knownTemplateKeys.has(template.key) ? <span className="block pt-2">Dieses Template ist nicht in den App-Defaults enthalten.</span> : null}
                    </div>
                    <Button>Template speichern</Button>
                  </form>
                </details>
              ))}
            </div>
          </Panel>

          <Panel>
            <h2 className="mb-4 text-lg font-semibold">Versandprotokoll</h2>
            <div className="space-y-2">
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
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
