import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Save, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, Field, inputClass, PageGuide, PageHeader, selectClass } from "@/components/ui";
import { isAccessibleOwner, ownerScope } from "@/lib/access";
import { currentUser } from "@/lib/auth";
import { formatDateTimeLocal } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { normalizeSlug, uniqueSlugForUpdate } from "@/lib/slug";

async function updateActivity(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id"));
  const scope = await ownerScope(user);
  const activity = await prisma.activityPlan.findFirst({ where: { id, ...scope } });
  if (!activity) notFound();

  const title = String(formData.get("title") || "").trim();
  const slug = await uniqueSlugForUpdate("activityPlan", normalizeSlug(String(formData.get("slug") || ""), title), activity.id);
  const plannedAtRaw = String(formData.get("plannedAt") || "");
  const toolIds = formData.getAll("tools").map(String);
  const positionIds = formData.getAll("positions").map(String);
  const [ownedTools, ownedPositions] = await Promise.all([
    prisma.toy.findMany({ where: { ...scope, id: { in: toolIds } }, select: { id: true } }),
    prisma.position.findMany({ where: { ...scope, id: { in: positionIds } }, select: { id: true } })
  ]);

  await prisma.activityPlan.update({
    where: { id: activity.id },
    data: {
      title,
      slug,
      category: String(formData.get("category") || "").trim(),
      note: String(formData.get("note") || "").trim(),
      plannedAt: plannedAtRaw ? new Date(plannedAtRaw) : null,
      status: String(formData.get("status") || "PLANNED") as "PLANNED" | "DONE" | "DISCARDED",
      tools: { set: ownedTools.map((tool) => ({ id: tool.id })) },
      positions: { set: ownedPositions.map((position) => ({ id: position.id })) }
    }
  });
  redirect(`/activities/${slug}`);
}

async function deleteActivity(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id"));
  const activity = await prisma.activityPlan.findFirst({ where: { id, ...(await ownerScope(user)) } });
  if (!activity) notFound();
  await prisma.activityPlan.delete({ where: { id: activity.id } });
  redirect("/activities");
}

const statusLabel = { PLANNED: "geplant", DONE: "durchgefuehrt", DISCARDED: "verworfen" } as const;

export default async function EditActivityPage({ params }: { params: { slug: string } }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const activity = await prisma.activityPlan.findUnique({ where: { slug: params.slug }, include: { tools: true, positions: true } });
  if (!activity || !(await isAccessibleOwner(user, activity.ownerId))) notFound();
  const scope = await ownerScope(user);
  const [toys, positions] = await Promise.all([
    prisma.toy.findMany({ where: scope, orderBy: { title: "asc" } }),
    prisma.position.findMany({ where: scope, orderBy: { name: "asc" } })
  ]);
  const selectedTools = new Set(activity.tools.map((tool) => tool.id));
  const selectedPositions = new Set(activity.positions.map((position) => position.id));

  return (
    <AppShell>
      <PageHeader title="Spielplan bearbeiten" subtitle={`/activities/${activity.slug}`} />
      <PageGuide>
        Passe hier Titel, Slug, Termin, Status, Notiz und die verknuepften Spielsachen oder Stellungen an. Loeschen entfernt nur diesen Plan, nicht die verwendeten Bausteine.
      </PageGuide>
      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <form action={updateActivity} className="grid gap-6 xl:grid-cols-[1fr_420px]">
          <input type="hidden" name="id" value={activity.id} />
          <div className="space-y-4">
            <Field label="Spielidee"><input className={inputClass} name="title" required defaultValue={activity.title} /></Field>
            <Field label="Kategorie"><input className={inputClass} name="category" defaultValue={activity.category || ""} /></Field>
            <Field label="URL-Slug"><input className={inputClass} name="slug" pattern="[a-z0-9-]*" defaultValue={activity.slug} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Datum und Uhrzeit"><input className={inputClass} name="plannedAt" type="datetime-local" defaultValue={formatDateTimeLocal(activity.plannedAt)} /></Field>
              <Field label="Status">
                <select className={selectClass} name="status" defaultValue={activity.status}>
                  {Object.entries(statusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Notiz"><textarea className={inputClass} name="note" rows={6} defaultValue={activity.note || ""} /></Field>
            <div className="flex flex-wrap gap-2">
              <Button><Save className="h-4 w-4" /> Aenderungen speichern</Button>
              <Link href={`/activities/${activity.slug}`} className="focus-ring inline-flex min-h-10 items-center justify-center rounded-md border border-line bg-surface px-4 py-2 text-sm font-semibold hover:bg-paper">
                Abbrechen
              </Link>
            </div>
          </div>
          <div className="space-y-5">
            <section>
              <h2 className="mb-2 text-sm font-semibold text-graphite">Spielsachen</h2>
              <div className="space-y-2">
                {toys.map((toy) => (
                  <label key={toy.id} className="flex gap-3 rounded-md bg-paper p-3 text-sm">
                    <input name="tools" value={toy.id} type="checkbox" defaultChecked={selectedTools.has(toy.id)} className="mt-1 h-4 w-4 accent-redbrand" />
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
                    <input name="positions" value={position.id} type="checkbox" defaultChecked={selectedPositions.has(position.id)} className="h-4 w-4 accent-redbrand" />
                    <span>{position.name}</span>
                  </label>
                ))}
              </div>
            </section>
          </div>
        </form>
        <form action={deleteActivity} className="rounded-lg border border-line bg-paper p-5">
          <input type="hidden" name="id" value={activity.id} />
          <h2 className="text-lg font-semibold">Loeschen</h2>
          <p className="mt-2 text-sm text-graphite">Entfernt diesen Spielplan und alle Verknuepfungen dazu.</p>
          <Button variant="danger" className="mt-4 w-full"><Trash2 className="h-4 w-4" /> Spielplan loeschen</Button>
        </form>
      </div>
    </AppShell>
  );
}
