import { redirect } from "next/navigation";
import { Save } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, Field, inputClass, PageGuide, PageHeader, selectClass } from "@/components/ui";
import { ownerScope } from "@/lib/access";
import { activityStatusLabel, type ActivityStatusValue, quarterHourOptions } from "@/lib/activity-status";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizeSlug, uniqueSlug } from "@/lib/slug";

async function createActivity(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  const title = String(formData.get("title") || "").trim();
  const slug = await uniqueSlug("activityPlan", normalizeSlug(String(formData.get("slug") || ""), title));
  const date = String(formData.get("date") || "");
  const time = String(formData.get("time") || "");
  const plannedAt = date ? new Date(`${date}T${time || "20:00"}:00`) : null;
  const toolIds = formData.getAll("tools").map(String);
  const positionIds = formData.getAll("positions").map(String);
  const scope = await ownerScope(user);
  const [accessibleTools, accessiblePositions] = await Promise.all([
    toolIds.length ? prisma.toy.findMany({ where: { ...scope, id: { in: toolIds } }, select: { id: true } }) : [],
    positionIds.length ? prisma.position.findMany({ where: { ...scope, id: { in: positionIds } }, select: { id: true } }) : []
  ]);
  await prisma.activityPlan.create({
    data: {
      ownerId: user.id,
      title,
      slug,
      category: String(formData.get("category") || "").trim(),
      note: String(formData.get("note") || "").trim(),
      plannedAt,
      status: String(formData.get("status") || "PLANNED") as ActivityStatusValue,
      tools: { connect: accessibleTools.map(({ id }) => ({ id })) },
      positions: { connect: accessiblePositions.map(({ id }) => ({ id })) }
    }
  });
  redirect(`/activities/${slug}`);
}

export default async function NewActivityPage({ searchParams }: { searchParams?: { date?: string } }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const scope = await ownerScope(user);
  const [toys, positions] = await Promise.all([
    prisma.toy.findMany({ where: scope, orderBy: [{ sortOrder: "asc" }, { title: "asc" }] }),
    prisma.position.findMany({ where: scope, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] })
  ]);
  const defaultDate = String(searchParams?.date || "").match(/^\d{4}-\d{2}-\d{2}$/) ? String(searchParams?.date) : "";
  return (
    <AppShell>
      <PageHeader title="Lass uns spielen" />
      <PageGuide title="Spielideen aus dem Baukastensystem">
        Erstelle hier einen konkreten Spielplan. Vergib Titel und Kategorie, setze optional Datum und Uhrzeit, waehle passende Spielsachen und Stellungen aus und speichere den Plan mit dem gewuenschten Status.
      </PageGuide>
      <form action={createActivity} className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <div className="space-y-4">
          <Field label="Spielidee"><input className={inputClass} name="title" required placeholder="Entspannungsabend" /></Field>
          <Field label="Kategorie"><input className={inputClass} name="category" placeholder="Entspannung, Bondage, Foto-Session" /></Field>
          <Field label="URL-Slug"><input className={inputClass} name="slug" pattern="[a-z0-9-]*" placeholder="entspannungsabend" /></Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Datum"><input className={inputClass} name="date" type="date" defaultValue={defaultDate} /></Field>
            <Field label="Uhrzeit">
              <select className={selectClass} name="time" defaultValue="20:00">
                {quarterHourOptions().map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select className={selectClass} name="status" defaultValue="PLANNED">
                {Object.entries(activityStatusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Notiz"><textarea className={inputClass} name="note" rows={6} /></Field>
          <Button><Save className="h-4 w-4" /> Plan speichern</Button>
        </div>
        <div className="space-y-5">
          <section>
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
          </section>
          <section>
            <h2 className="mb-2 text-sm font-semibold text-graphite">Stellungen</h2>
            <div className="space-y-2">
              {positions.map((position) => (
                <label key={position.id} className="flex items-center gap-3 rounded-md bg-paper p-3 text-sm">
                  <input name="positions" value={position.id} type="checkbox" className="h-4 w-4 accent-redbrand" />
                  <span>{position.name}</span>
                </label>
              ))}
            </div>
          </section>
        </div>
      </form>
    </AppShell>
  );
}
