import { redirect } from "next/navigation";
import { CalendarClock, Save, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Button, Field, inputClass, PageGuide, PageHeader, Panel, selectClass } from "@/components/ui";
import { currentUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { requireFeature } from "@/lib/features";
import { notificationActionOptions } from "@/lib/notification-actions";
import { prisma } from "@/lib/prisma";
import { initialNextRun, scheduleSummary } from "@/lib/scheduled-rules";
import { currentTenant } from "@/lib/tenancy";

const minuteOptions = ["00", "15", "30", "45"];
const weekdays = [
  ["1", "Mo"],
  ["2", "Di"],
  ["3", "Mi"],
  ["4", "Do"],
  ["5", "Fr"],
  ["6", "Sa"],
  ["0", "So"]
] as const;

function timeParts(minutes: number) {
  return { hour: String(Math.floor(minutes / 60)).padStart(2, "0"), minute: String(minutes % 60).padStart(2, "0") };
}

function readJson(value: string, fallback: Record<string, unknown> = {}) {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function ruleData(formData: FormData, tenantId: string, ownerId: string) {
  const scheduleType = String(formData.get("scheduleType") || "DAILY");
  const hour = Number(formData.get("hour") || 16);
  const minute = Number(formData.get("minute") || 0);
  const conditionType = String(formData.get("conditionType") || "ALWAYS");
  const actionType = String(formData.get("actionType") || "EXTERNAL_URL");
  const conditionJson = {
    trackerKey: String(formData.get("conditionTrackerKey") || ""),
    state: String(formData.get("conditionState") || "green"),
    action: String(formData.get("conditionAction") || ""),
    actorMode: String(formData.get("conditionActorMode") || "owner"),
    lookbackMinutes: Number(formData.get("lookbackMinutes") || 1440)
  };
  const actionJson = {
    url: String(formData.get("url") || "").trim(),
    method: String(formData.get("method") || "POST"),
    payloadTemplate: String(formData.get("payloadTemplate") || "{\"rule\":\"{ruleName}\",\"condition\":\"{condition}\",\"actor\":\"{actor}\"}"),
    headersJson: readJson(String(formData.get("headersJson") || "{}")),
    state: String(formData.get("playReadyState") || "green"),
    action: String(formData.get("auditAction") || "scheduled_rule_executed"),
    title: String(formData.get("auditTitle") || "Zeitregel ausgeführt: {ruleName}"),
    href: String(formData.get("auditHref") || "/settings/scheduled")
  };
  const data = {
    tenantId,
    ownerId,
    name: String(formData.get("name") || "Neue Zeitregel").trim(),
    active: formData.get("active") === "on",
    scheduleType,
    timeOfDayMinutes: Math.min(23, Math.max(0, hour)) * 60 + Math.min(45, Math.max(0, minute)),
    daysOfWeek: formData.getAll("daysOfWeek").map(Number).filter((value) => Number.isFinite(value)),
    dayOfMonth: Number(formData.get("dayOfMonth") || 1),
    intervalMinutes: Number(formData.get("intervalMinutes") || 60),
    timezone: "Europe/Berlin",
    conditionType,
    conditionJson,
    actionType,
    actionJson
  };
  return { ...data, nextRunAt: data.active ? initialNextRun(data) : null };
}

async function createRule(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  await requireFeature("scheduledRules");
  const tenant = await currentTenant();
  if (!tenant) redirect("/");
  await prisma.scheduledRule.create({ data: ruleData(formData, tenant.id, user.id) });
  redirect("/settings/scheduled?saved=created");
}

async function updateRule(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  await requireFeature("scheduledRules");
  const tenant = await currentTenant();
  if (!tenant) redirect("/");
  const id = String(formData.get("id") || "");
  await prisma.scheduledRule.updateMany({ where: { id, tenantId: tenant.id, ownerId: user.id }, data: ruleData(formData, tenant.id, user.id) });
  redirect("/settings/scheduled?saved=updated");
}

async function deleteRule(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  await requireFeature("scheduledRules");
  const id = String(formData.get("id") || "");
  await prisma.scheduledRule.deleteMany({ where: { id, ownerId: user.id } });
  redirect("/settings/scheduled?saved=deleted");
}

function RuleForm({
  action,
  trackers,
  actionOptions,
  rule
}: {
  action: (formData: FormData) => Promise<void>;
  trackers: { key: string; title: string }[];
  actionOptions: { action: string; label: string }[];
  rule?: {
    id: string;
    name: string;
    active: boolean;
    scheduleType: string;
    timeOfDayMinutes: number;
    daysOfWeek: number[];
    dayOfMonth: number | null;
    intervalMinutes: number | null;
    conditionType: string;
    conditionJson: unknown;
    actionType: string;
    actionJson: unknown;
  };
}) {
  const condition = rule?.conditionJson && typeof rule.conditionJson === "object" ? rule.conditionJson as Record<string, unknown> : {};
  const actionJson = rule?.actionJson && typeof rule.actionJson === "object" ? rule.actionJson as Record<string, unknown> : {};
  const parts = timeParts(rule?.timeOfDayMinutes ?? 960);
  const selectedWeekdays = new Set(rule?.daysOfWeek || []);
  return (
    <form action={action} className="space-y-4">
      {rule ? <input type="hidden" name="id" value={rule.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name"><input className={inputClass} name="name" defaultValue={rule?.name || ""} placeholder="Alexa Kontingentansage" required /></Field>
        <Field label="Zeitplan">
          <select className={selectClass} name="scheduleType" defaultValue={rule?.scheduleType || "DAILY"}>
            <option value="DAILY">Täglich</option>
            <option value="WEEKLY">Wöchentlich</option>
            <option value="MONTHLY">Monatlich</option>
            <option value="INTERVAL">Intervall</option>
          </select>
        </Field>
        <Field label="Stunde">
          <select className={selectClass} name="hour" defaultValue={parts.hour}>
            {Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0")).map((hour) => <option key={hour} value={hour}>{hour} Uhr</option>)}
          </select>
        </Field>
        <Field label="Minute">
          <select className={selectClass} name="minute" defaultValue={parts.minute}>
            {minuteOptions.map((minute) => <option key={minute} value={minute}>{minute}</option>)}
          </select>
        </Field>
        <Field label="Intervall Minuten"><input className={inputClass} name="intervalMinutes" type="number" min="15" step="15" defaultValue={rule?.intervalMinutes || 60} /></Field>
        <Field label="Tag im Monat"><input className={inputClass} name="dayOfMonth" type="number" min="1" max="31" defaultValue={rule?.dayOfMonth || 1} /></Field>
      </div>
      <div className="flex flex-wrap gap-2 rounded-md border border-line bg-paper p-3 text-sm">
        {weekdays.map(([value, label]) => (
          <label key={value} className="inline-flex items-center gap-2 rounded-md bg-surface px-3 py-2">
            <input name="daysOfWeek" type="checkbox" value={value} defaultChecked={selectedWeekdays.has(Number(value))} className="h-4 w-4 accent-redbrand" />
            {label}
          </label>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Bedingung">
          <select className={selectClass} name="conditionType" defaultValue={rule?.conditionType || "ALWAYS"}>
            <option value="ALWAYS">Immer ausführen</option>
            <option value="TRACKER_QUOTA_OPEN">Tracker-Kontingent offen</option>
            <option value="TRACKER_QUOTA_DONE">Tracker-Kontingent erfüllt</option>
            <option value="PLAY_READY_IS">Ampel hat Status</option>
            <option value="TRACKER_OPEN">Tracker läuft</option>
            <option value="AUDIT_ACTION">Protokollaktion gefunden</option>
          </select>
        </Field>
        <Field label="Tracker optional">
          <select className={selectClass} name="conditionTrackerKey" defaultValue={String(condition.trackerKey || "")}>
            <option value="">Alle Tracker</option>
            {trackers.map((tracker) => <option key={tracker.key} value={tracker.key}>{tracker.title}</option>)}
          </select>
        </Field>
        <Field label="Ampelstatus">
          <select className={selectClass} name="conditionState" defaultValue={String(condition.state || "green")}>
            <option value="green">Grün</option>
            <option value="red">Rot</option>
          </select>
        </Field>
        <Field label="Protokollaktion">
          <select className={selectClass} name="conditionAction" defaultValue={String(condition.action || "")}>
            <option value="">-</option>
            {actionOptions.map((option) => <option key={option.action} value={option.action}>{option.label}</option>)}
          </select>
        </Field>
        <Field label="Zeitraum Minuten"><input className={inputClass} name="lookbackMinutes" type="number" min="15" step="15" defaultValue={String(condition.lookbackMinutes || 1440)} /></Field>
        <Field label="Benutzerfilter">
          <select className={selectClass} name="conditionActorMode" defaultValue={String(condition.actorMode || "owner")}>
            <option value="owner">Nur meine Aktionen</option>
            <option value="any">Alle sichtbaren Aktionen</option>
          </select>
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Aktion">
          <select className={selectClass} name="actionType" defaultValue={rule?.actionType || "EXTERNAL_URL"}>
            <option value="EXTERNAL_URL">Externe URL aufrufen</option>
            <option value="SET_PLAY_READY">Ampel setzen</option>
            <option value="CREATE_AUDIT">Protokollaktion erzeugen</option>
          </select>
        </Field>
        <Field label="Methode"><select className={selectClass} name="method" defaultValue={String(actionJson.method || "POST")}><option>POST</option><option>GET</option><option>PUT</option></select></Field>
        <Field label="URL"><input className={inputClass} name="url" type="url" defaultValue={String(actionJson.url || "")} placeholder="https://iobroker.example/alexa" /></Field>
        <Field label="Ampel setzen"><select className={selectClass} name="playReadyState" defaultValue={String(actionJson.state || "green")}><option value="green">Grün</option><option value="red">Rot</option><option value="toggle">Umschalten</option></select></Field>
      </div>
      <Field label="Payload Template">
        <textarea className={inputClass} name="payloadTemplate" rows={4} defaultValue={String(actionJson.payloadTemplate || "{\"rule\":\"{ruleName}\",\"condition\":\"{condition}\",\"actor\":\"{actor}\"}")} />
      </Field>
      <Field label="Header JSON">
        <textarea className={inputClass} name="headersJson" rows={3} defaultValue={JSON.stringify(actionJson.headersJson || {}, null, 2)} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Protokollaktion"><input className={inputClass} name="auditAction" defaultValue={String(actionJson.action || "scheduled_rule_executed")} /></Field>
        <Field label="Protokolltitel"><input className={inputClass} name="auditTitle" defaultValue={String(actionJson.title || "Zeitregel ausgeführt: {ruleName}")} /></Field>
      </div>
      <label className="flex items-center gap-2 text-sm font-semibold text-graphite">
        <input name="active" type="checkbox" defaultChecked={rule?.active ?? true} className="h-4 w-4 accent-redbrand" />
        aktiv
      </label>
      <SubmitButton pendingLabel="Zeitregel wird gespeichert..."><Save className="h-4 w-4" /> Zeitregel speichern</SubmitButton>
    </form>
  );
}

export default async function ScheduledRulesPage({ searchParams }: { searchParams?: { saved?: string } }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  await requireFeature("scheduledRules");
  const tenant = await currentTenant();
  if (!tenant) redirect("/");
  const [rules, trackers, auditActions] = await Promise.all([
    prisma.scheduledRule.findMany({ where: { tenantId: tenant.id, ownerId: user.id }, include: { runs: { orderBy: { createdAt: "desc" }, take: 3 } }, orderBy: { createdAt: "desc" } }),
    prisma.trackerType.findMany({ where: { enabled: true, OR: [{ tenantId: tenant.id }, { tenantId: null }] }, orderBy: { title: "asc" } }),
    prisma.auditLog.findMany({ distinct: ["action"], select: { action: true }, orderBy: { action: "asc" } })
  ]);
  const actionOptions = await notificationActionOptions({ tenantId: tenant.id, auditActions: auditActions.map((entry) => entry.action) });
  return (
    <AppShell>
      <PageHeader title="Zeitregeln" />
      <PageGuide title="Geplante URL-Aufrufe und Aktionen">
        Zeitregeln laufen im internen 15-Minuten-Takt. Sie prüfen eine Bedingung und rufen dann eine URL auf, setzen die Ampel oder erzeugen eine Protokollaktion.
      </PageGuide>
      {searchParams?.saved ? <div className="mb-4 rounded-md border border-line bg-paper p-3 text-sm font-semibold text-graphite">Zeitregel gespeichert.</div> : null}
      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <Panel>
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold"><CalendarClock className="h-5 w-5 text-redbrand" /> Neue Zeitregel</h2>
          <RuleForm action={createRule} trackers={trackers} actionOptions={actionOptions} />
        </Panel>
        <div className="space-y-4">
          {rules.map((rule) => (
            <Panel key={rule.id} className="p-0">
              <details>
                <summary className="flex cursor-pointer list-none items-start justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
                  <span>
                    <strong className="block text-ink">{rule.name}</strong>
                    <span className="text-sm text-graphite">{scheduleSummary(rule)} · nächste Ausführung {rule.nextRunAt ? formatDateTime(rule.nextRunAt) : "pausiert"}</span>
                  </span>
                  <Badge tone={rule.active ? "green" : "neutral"}>{rule.active ? "aktiv" : "pausiert"}</Badge>
                </summary>
                <div className="space-y-4 border-t border-line p-5">
                  <RuleForm action={updateRule} trackers={trackers} actionOptions={actionOptions} rule={rule} />
                  <form action={deleteRule}>
                    <input type="hidden" name="id" value={rule.id} />
                    <Button variant="danger"><Trash2 className="h-4 w-4" /> Zeitregel löschen</Button>
                  </form>
                  {rule.runs.length ? (
                    <div className="rounded-md border border-line bg-paper p-3 text-sm">
                      <h3 className="mb-2 font-semibold text-ink">Letzte Läufe</h3>
                      <div className="space-y-2">
                        {rule.runs.map((run) => (
                          <div key={run.id} className="flex flex-wrap items-center gap-2 text-graphite">
                            <Badge tone={run.status === "SENT" ? "green" : run.status === "FAILED" ? "red" : "neutral"}>{run.status}</Badge>
                            <span>{formatDateTime(run.createdAt)}</span>
                            <span>{run.message}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </details>
            </Panel>
          ))}
          {!rules.length ? <Panel><p className="text-sm text-graphite">Noch keine Zeitregeln angelegt.</p></Panel> : null}
        </div>
      </div>
    </AppShell>
  );
}
