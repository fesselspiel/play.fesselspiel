import { redirect } from "next/navigation";
import { BellRing, Save } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { SubmitButton } from "@/components/submit-button";
import { Field, inputClass, PageGuide, PageHeader, Panel, selectClass } from "@/components/ui";
import { currentSessionContext } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { logAction, userDisplayName } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

function secretPreview(value?: string | null) {
  if (!value) return "nicht gespeichert";
  return `gespeichert`;
}

function normalizePrivateKey(value: string) {
  return value.trim().replace(/\\n/g, "\n");
}

async function requirePushAdmin() {
  const { actor, tenant } = await currentSessionContext();
  if (!actor) redirect("/login");
  if (actor.role !== "ADMIN" && actor.role !== "SUPER_ADMIN") redirect("/");
  if (!tenant) redirect("/");
  return { actor, tenant };
}

async function savePushSettings(formData: FormData) {
  "use server";
  const { actor, tenant } = await requirePushAdmin();
  const existing = await prisma.nativePushSettings.findUnique({ where: { tenantId: tenant.id } });
  const privateKey = normalizePrivateKey(String(formData.get("privateKey") || ""));
  const teamId = String(formData.get("teamId") || "").trim();
  const keyId = String(formData.get("keyId") || "").trim();
  const bundleId = String(formData.get("bundleId") || "fspiel.playplaner").trim() || "fspiel.playplaner";
  const environment = String(formData.get("environment") || "production") === "sandbox" ? "sandbox" : "production";

  await prisma.nativePushSettings.upsert({
    where: { tenantId: tenant.id },
    update: {
      enabled: formData.get("enabled") === "on",
      teamId,
      keyId,
      bundleId,
      environment,
      ...(privateKey ? { privateKeyEnc: encryptSecret(privateKey) } : {})
    },
    create: {
      tenantId: tenant.id,
      enabled: formData.get("enabled") === "on",
      teamId,
      keyId,
      bundleId,
      environment,
      privateKeyEnc: encryptSecret(privateKey)
    }
  });

  await logAction({
    actorId: actor.id,
    action: "native_push_settings_updated",
    entityType: "tenant",
    entityId: tenant.id,
    title: `${userDisplayName(actor)} hat native Pushnachrichten gespeichert`,
    href: "/settings/push",
    details: {
      enabled: formData.get("enabled") === "on",
      hasTeamId: Boolean(teamId),
      hasKeyId: Boolean(keyId),
      hasBundleId: Boolean(bundleId),
      hasPrivateKey: Boolean(privateKey || existing?.privateKeyEnc),
      environment
    }
  });
  redirect("/settings/push?saved=1");
}

export default async function PushSettingsPage({ searchParams }: { searchParams: { saved?: string } }) {
  const { tenant } = await requirePushAdmin();
  const settings = await prisma.nativePushSettings.findUnique({ where: { tenantId: tenant.id } });
  return (
    <AppShell>
      <PageHeader title="Push" subtitle="Native Pushnachrichten für die mobile App dieser Seite." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Panel>
          {searchParams.saved ? <p className="mb-4 rounded-md border border-line bg-paper p-3 text-sm text-graphite">Push-Einstellungen gespeichert.</p> : null}
          <form action={savePushSettings} className="space-y-5">
            <label className="flex items-start gap-3 rounded-lg border border-line bg-paper p-4 text-sm text-graphite">
              <input name="enabled" type="checkbox" defaultChecked={settings?.enabled || false} className="mt-1 h-4 w-4 accent-redbrand" />
              <span>
                <strong className="block text-ink">Native Pushnachrichten aktivieren</strong>
                <span>Wenn diese Option aus ist oder Daten fehlen, werden Geräte weiter registriert, aber es wird nichts an APNs gesendet.</span>
              </span>
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Apple Team ID"><input className={inputClass} name="teamId" defaultValue={settings?.teamId || ""} /></Field>
              <Field label="Key ID"><input className={inputClass} name="keyId" defaultValue={settings?.keyId || ""} /></Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Bundle ID"><input className={inputClass} name="bundleId" defaultValue={settings?.bundleId || "fspiel.playplaner"} /></Field>
              <Field label="APNs Umgebung">
                <select className={selectClass} name="environment" defaultValue={settings?.environment || "production"}>
                  <option value="production">Production</option>
                  <option value="sandbox">Sandbox</option>
                </select>
              </Field>
            </div>
            <Field label={`APNs Private Key (${secretPreview(settings?.privateKeyEnc)})`}>
              <textarea className={inputClass} name="privateKey" rows={8} placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----" />
            </Field>
            <p className="text-xs leading-5 text-graphite">Das Private-Key-Feld darf leer bleiben, wenn bereits ein Key gespeichert ist. Ein neuer Key überschreibt den alten verschlüsselt in der Datenbank.</p>
            <SubmitButton pendingLabel="Push wird gespeichert..."><Save className="h-4 w-4" /> Push speichern</SubmitButton>
          </form>
        </Panel>
        <PageGuide title="Native Pushnachrichten">
          <span className="inline-flex items-center gap-2"><BellRing className="h-4 w-4" /> Hier hinterlegst du die APNs-Daten aus Apple Developer für diese Seite. Diese Werte werden nicht als Start-Umgebungsvariablen verwendet, sondern kontrolliert im Backend gespeichert.</span>
        </PageGuide>
      </div>
    </AppShell>
  );
}
