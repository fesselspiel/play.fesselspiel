import { redirect } from "next/navigation";
import { Save } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { SelfBondageScheduleFields } from "@/components/self-bondage-schedule-fields";
import { Button, Field, inputClass, PageGuide, PageHeader, selectClass } from "@/components/ui";
import { ownerScope } from "@/lib/access";
import { activityStatusOptions, type ActivityStatusValue, quarterHourOptions } from "@/lib/activity-status";
import { logAction } from "@/lib/audit";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizeSlug, uniqueSlug } from "@/lib/slug";

async function createActivity(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  const selfBondageTemplate = String(formData.get("template") || "") === "self-bondage";
  const title = String(formData.get("title") || "").trim();
  const slug = await uniqueSlug("activityPlan", normalizeSlug(String(formData.get("slug") || ""), title));
  const date = String(formData.get("date") || "");
  const time = String(formData.get("time") || "");
  const withoutSchedule = selfBondageTemplate && formData.get("noSchedule") === "on";
  const plannedAt = !withoutSchedule && date ? new Date(`${date}T${time || "20:00"}:00`) : null;
  const toolIds = selfBondageTemplate ? [] : formData.getAll("tools").map(String);
  const positionIds = formData.getAll("positions").map(String);
  const scope = await ownerScope(user);
  const [accessibleTools, accessiblePositions] = await Promise.all([
    toolIds.length ? prisma.toy.findMany({ where: { ...scope, id: { in: toolIds } }, select: { id: true } }) : [],
    positionIds.length ? prisma.position.findMany({ where: { ...scope, id: { in: positionIds }, ...(selfBondageTemplate ? { selfBondageCapable: true } : {}) }, select: { id: true } }) : []
  ]);
  const status = String(formData.get("status") || "PLANNED") as ActivityStatusValue;
  const activity = await prisma.activityPlan.create({
    data: {
      ownerId: user.id,
      title,
      slug,
      category: selfBondageTemplate ? "SELF_BONDAGE_ORDER" : String(formData.get("category") || "").trim(),
      note: String(formData.get("note") || "").trim(),
      plannedAt,
      status,
      tools: { connect: accessibleTools.map(({ id }) => ({ id })) },
      positions: { connect: accessiblePositions.map(({ id }) => ({ id })) }
    }
  });
  await logAction({
    actorId: user.id,
    action: status === "REQUESTED" ? "activity_requested" : "activity_created",
    entityType: "activity",
    entityId: activity.id,
    title: `${status === "REQUESTED" ? "Spielplan angefragt" : "Spielplan angelegt"}: ${activity.title}`,
    href: `/activities/${activity.slug}`
  });
  redirect(`/activities/${slug}`);
}

export default async function NewActivityPage({ searchParams }: { searchParams?: { date?: string; template?: string } }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const scope = await ownerScope(user);
  const [toys, positions] = await Promise.all([
    prisma.toy.findMany({ where: scope, orderBy: [{ sortOrder: "asc" }, { title: "asc" }] }),
    prisma.position.findMany({ where: { ...scope, ...(searchParams?.template === "self-bondage" ? { selfBondageCapable: true } : {}) }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] })
  ]);
  const defaultDate = String(searchParams?.date || "").match(/^\d{4}-\d{2}-\d{2}$/) ? String(searchParams?.date) : "";
  const selfBondageTemplate = searchParams?.template === "self-bondage";
  const defaultTitle = selfBondageTemplate ? "Self-Bondage-Auftrag" : "";
  const defaultNote = selfBondageTemplate
    ? "Auftrag: Bring dich in die ausgewählte Lage und richte dich so ein, dass du ruhig warten kannst. Dokumentiere danach kurz, wie die Vorbereitung funktioniert hat."
    : "";
  const statusOptions = activityStatusOptions(selfBondageTemplate);
  const timeOptions = quarterHourOptions();
  return (
    <AppShell>
      <PageHeader title={selfBondageTemplate ? "Self-Bondage-Auftrag" : "Lass uns spielen"} />
      <PageGuide title={selfBondageTemplate ? "Auftrag zum Vorbereiten" : "Spielideen aus dem Baukastensystem"}>
        {selfBondageTemplate
          ? "Erstelle hier einen Auftrag, bei dem eine Person sich selbst in eine passende Lage bringt. Es werden nur Stellungen angeboten, die als Self-Bondage-fähig markiert sind."
          : "Erstelle hier einen konkreten Spielplan. Vergib Titel und Kategorie, setze optional Datum und Uhrzeit, Wähle passende Spielsachen und Stellungen aus und speichere den Plan mit dem gewünschten Status."}
      </PageGuide>
      <form action={createActivity} className="grid gap-6 xl:grid-cols-[1fr_420px]">
        {selfBondageTemplate ? <input type="hidden" name="template" value="self-bondage" /> : null}
        <div className="space-y-4">
          <Field label={selfBondageTemplate ? "Auftrag" : "Spieltermin"}><input className={inputClass} name="title" required placeholder={selfBondageTemplate ? "Self-Bondage-Auftrag" : "Entspannungsabend"} defaultValue={defaultTitle} /></Field>
          {selfBondageTemplate ? null : (
            <>
              <Field label="Kategorie"><input className={inputClass} name="category" placeholder="Entspannung, Bondage, Foto-Session" /></Field>
              <Field label="URL-Slug"><input className={inputClass} name="slug" pattern="[a-z0-9-]*" placeholder="entspannungsabend" /></Field>
            </>
          )}
          {selfBondageTemplate ? (
            <SelfBondageScheduleFields
              mode="new"
              defaultDate={defaultDate}
              defaultWithoutSchedule={!defaultDate}
              statusDefault="REQUESTED"
              statusOptions={statusOptions}
              timeOptions={timeOptions}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Datum"><input className={inputClass} name="date" type="date" defaultValue={defaultDate} /></Field>
              <Field label="Uhrzeit">
                <select className={selectClass} name="time" defaultValue="20:00">
                  {timeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </Field>
              <Field label="Status">
                <select className={selectClass} name="status" defaultValue="PLANNED">
                  {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </Field>
            </div>
          )}
          <Field label={selfBondageTemplate ? "Anweisung" : "Notiz"}><textarea className={inputClass} name="note" rows={6} defaultValue={defaultNote} /></Field>
          <Button><Save className="h-4 w-4" /> {selfBondageTemplate ? "Auftrag speichern" : "Plan speichern"}</Button>
        </div>
        <div className="space-y-5">
          {!selfBondageTemplate ? <section>
            <h2 className="mb-2 text-sm font-semibold text-graphite">Spielsachen</h2>
            <div className="space-y-2">
              {toys.map((toy) => (
                <label key={toy.id} className="flex gap-3 rounded-md bg-paper p-3 text-sm">
                  <input name="tools" value={toy.id} type="checkbox" className="mt-1 h-4 w-4 accent-redbrand" />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={toy.imageUrl || "/toy-placeholder.svg"} alt="" className="h-12 w-12 rounded-md object-cover" />
                  <span><strong className="block">{toy.title}</strong><span className="text-graphite">{toy.description || "Keine Kurzbeschreibung."}</span></span>
                </label>
              ))}
            </div>
          </section> : null}
          <section>
            <h2 className="mb-2 text-sm font-semibold text-graphite">{selfBondageTemplate ? "Self-Bondage-fähige Stellungen" : "Stellungen"}</h2>
            <div className="space-y-2">
              {positions.map((position) => (
                <label key={position.id} className="flex items-center gap-3 rounded-md bg-paper p-3 text-sm">
                  <input name="positions" value={position.id} type="checkbox" defaultChecked={selfBondageTemplate} className="h-4 w-4 accent-redbrand" />
                  <span className="min-w-0">
                    <span className="block font-medium">{position.name}</span>
                    {position.selfBondageCapable ? <span className="block text-xs text-sky-700">Self-Bondage-fähig</span> : null}
                  </span>
                </label>
              ))}
              {selfBondageTemplate && !positions.length ? (
                <p className="rounded-md bg-paper p-3 text-sm text-graphite">Es gibt noch keine Stellung mit dem Feld „Self-Bondage-fähig“.</p>
              ) : null}
            </div>
          </section>
        </div>
      </form>
    </AppShell>
  );
}
