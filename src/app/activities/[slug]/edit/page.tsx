import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Save, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { SelfBondagePositionChoice } from "@/components/self-bondage-position-choice";
import { SelfBondageScheduleFields } from "@/components/self-bondage-schedule-fields";
import { Button, Field, inputClass, PageGuide, PageHeader, selectClass } from "@/components/ui";
import { activityStatusOptions, type ActivityStatusValue } from "@/lib/activity-status";
import { bondageSystemVisibilityScope, contentTenantScope, isAccessibleOwner, ownerScope } from "@/lib/access";
import { createSessionHistoryForCompletedOrder, isSelfBondageOrder as isSelfBondageActivity, selfBondageCategory } from "@/lib/activity-orders";
import { logAction } from "@/lib/audit";
import { currentUser } from "@/lib/auth";
import { formatDateTimeLocal } from "@/lib/dates";
import { hasFeature, requireFeature } from "@/lib/features";
import { deleteOwnedFile, fileIdFromUrl } from "@/lib/files";
import { prisma } from "@/lib/prisma";
import { uniqueSlugForUpdate } from "@/lib/slug";

function positionNoteValue(note?: string | null) {
  const match = String(note || "").match(/^(?:Szene|Stellung):\s*(.+)$/m);
  return match?.[1]?.trim() || "";
}

function stripPositionNote(note: string) {
  return note
    .split("\n")
    .filter((line) => !/^(?:Szene|Stellung):/.test(line.trim()))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function selfBondagePositionNote(choice: string, customText: string) {
  if (choice === "custom") return `Szene: ${customText}`;
  if (choice === "surprise") return "Szene: Denk dir was aus.";
  return "";
}

function appendSelfBondagePositionNote(note: string, choice: string, customText: string) {
  const cleanNote = stripPositionNote(note);
  const positionNote = selfBondagePositionNote(choice, customText);
  return [cleanNote, positionNote].filter(Boolean).join("\n\n");
}

async function updateActivity(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  await requireFeature("activities");
  const id = String(formData.get("id"));
  const scope = await ownerScope(user);
  const activity = await prisma.activityPlan.findFirst({ where: { id, ...scope } });
  if (!activity) notFound();
  const selfBondageOrder = isSelfBondageActivity(activity);
  const idea = activity.category === "IDEA_COLLECTION";

  const title = String(formData.get("title") || "").trim();
  const slug = await uniqueSlugForUpdate("activityPlan", title, activity.id, user.tenantId);
  const plannedAtRaw = String(formData.get("plannedAt") || "");
  const withoutSchedule = selfBondageOrder && formData.get("noSchedule") === "on";
  if (selfBondageOrder) await requireFeature("orders");
  const toolsEnabled = await hasFeature("toys");
  const positionsEnabled = await hasFeature("positions");
  const bondageSystemEnabled = await hasFeature("shopifyBondageSystem");
  const toolIds = selfBondageOrder || !toolsEnabled ? [] : formData.getAll("tools").map(String);
  const bondageItemIds = selfBondageOrder || !bondageSystemEnabled ? [] : formData.getAll("bondageSystemItems").map(String);
  const selfBondageChoice = String(formData.get("selfBondageChoice") || "");
  const selfBondageCustomText = String(formData.get("selfBondageCustomText") || "").trim();
  if (selfBondageOrder && !selfBondageChoice) redirect(`/activities/${activity.slug}/edit?error=position`);
  if (selfBondageOrder && selfBondageChoice === "custom" && !selfBondageCustomText) redirect(`/activities/${activity.slug}/edit?error=position-text`);
  const positionIds = selfBondageOrder
    ? selfBondageChoice.startsWith("position:") ? [selfBondageChoice.replace("position:", "")].filter(Boolean) : []
    : positionsEnabled ? formData.getAll("positions").map(String) : [];
  const [ownedTools, ownedPositions, ownedBondageItems] = await Promise.all([
    prisma.toy.findMany({ where: { ...scope, id: { in: toolIds } }, select: { id: true } }),
    prisma.position.findMany({ where: { ...scope, id: { in: positionIds }, ...(selfBondageOrder ? { selfBondageCapable: true } : {}) }, select: { id: true } }),
    prisma.bondageSystemItem.findMany({ where: { tenantId: user.tenantId || undefined, id: { in: bondageItemIds }, visible: true, ...bondageSystemVisibilityScope(user) }, select: { id: true } })
  ]);
  if (selfBondageOrder && selfBondageChoice.startsWith("position:") && ownedPositions.length !== 1) redirect(`/activities/${activity.slug}/edit?error=position`);
  const note = selfBondageOrder
    ? appendSelfBondagePositionNote(String(formData.get("note") || "").trim(), selfBondageChoice, selfBondageCustomText)
    : String(formData.get("note") || "").trim();

  const nextStatus = String(formData.get("status") || "PLANNED") as ActivityStatusValue;
  const updated = await prisma.activityPlan.update({
    where: { id: activity.id },
    data: {
      title,
      slug,
      category: selfBondageOrder ? selfBondageCategory : idea ? "IDEA_COLLECTION" : null,
      note,
      plannedAt: !idea && !withoutSchedule && plannedAtRaw ? new Date(plannedAtRaw) : null,
      status: nextStatus,
      tools: { set: ownedTools.map((tool) => ({ id: tool.id })) },
      bondageSystemItems: { set: ownedBondageItems.map((item) => ({ id: item.id })) },
      positions: { set: ownedPositions.map((position) => ({ id: position.id })) }
    }
  });
  if (selfBondageOrder) {
    const session = nextStatus === "DONE" ? await createSessionHistoryForCompletedOrder(updated, user.id) : null;
    await logAction({
      actorId: user.id,
      action: "self_bondage_order_updated",
      entityType: "activity",
      entityId: updated.id,
      title: `Auftrag geändert: ${updated.title}`,
      href: `/orders#order-${updated.id}`,
      details: {
        status: nextStatus,
        orderUrl: `/activities/${updated.slug}`,
        sessionUrl: session?.slug ? `/sessions/${session.slug}` : null,
        excludeActorFromTargets: true
      }
    });
  }
  redirect(selfBondageOrder ? `/orders#order-${activity.id}` : `/activities/${slug}`);
}

async function deleteActivity(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  await requireFeature("activities");
  const id = String(formData.get("id"));
  const activity = await prisma.activityPlan.findFirst({ where: { id, ...(await ownerScope(user)) } });
  if (!activity) notFound();
  const [images, media] = await Promise.all([
    prisma.activityImage.findMany({ where: { activityId: activity.id }, include: { file: true } }),
    prisma.media.findMany({ where: { activityId: activity.id } })
  ]);
  const selfBondageOrder = isSelfBondageActivity(activity);
  await prisma.activityPlan.delete({ where: { id: activity.id } });
  for (const image of images) {
    await deleteOwnedFile(image.file.ownerId, image.file.id);
  }
  for (const entry of media) {
    const fileId = fileIdFromUrl(entry.url);
    if (fileId) await deleteOwnedFile(entry.ownerId, fileId);
  }
  redirect(selfBondageOrder ? "/orders" : "/activities");
}

export default async function EditActivityPage(
  props: { params: Promise<{ slug: string }>; searchParams?: Promise<{ error?: string }> }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  await requireFeature("activities");
  const user = await currentUser();
  if (!user) redirect("/login");
  const toolsEnabled = await hasFeature("toys");
  const positionsEnabled = await hasFeature("positions");
  const bondageSystemEnabled = await hasFeature("shopifyBondageSystem");
  const activity = await prisma.activityPlan.findFirst({ where: { slug: params.slug, ...contentTenantScope(user) }, include: { tools: toolsEnabled, bondageSystemItems: bondageSystemEnabled, positions: positionsEnabled } });
  if (!activity || !(await isAccessibleOwner(user, activity.ownerId))) notFound();
  if (isSelfBondageActivity(activity)) await requireFeature("orders");
  const scope = await ownerScope(user);
  const [toys, positions, bondageItems] = await Promise.all([
    toolsEnabled ? prisma.toy.findMany({ where: scope, orderBy: [{ sortOrder: "asc" }, { title: "asc" }] }) : [],
    positionsEnabled ? prisma.position.findMany({ where: { ...scope, ...(isSelfBondageActivity(activity) ? { selfBondageCapable: true } : {}) }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }) : [],
    bondageSystemEnabled ? prisma.bondageSystemItem.findMany({ where: { tenantId: user.tenantId || undefined, visible: true, ...bondageSystemVisibilityScope(user) }, include: { product: true }, orderBy: [{ sortOrder: "asc" }, { product: { title: "asc" } }] }) : []
  ]);
  const isSelfBondageOrder = isSelfBondageActivity(activity);
  const isIdea = activity.category === "IDEA_COLLECTION";
  const selectedTools = new Set(((activity as { tools?: { id: string }[] }).tools || []).map((tool) => tool.id));
  const selectedBondageItems = new Set(((activity as { bondageSystemItems?: { id: string }[] }).bondageSystemItems || []).map((item) => item.id));
  const selectedPositions = new Set(((activity as { positions?: { id: string }[] }).positions || []).map((position) => position.id));
  const statusOptions = activityStatusOptions(isSelfBondageOrder, isIdea);
  const customPositionText = positionNoteValue(activity.note);
  const selectedPosition = ((activity as { positions?: { id: string; selfBondageCapable: boolean }[] }).positions || []).find((position) => position.selfBondageCapable);
  const selfBondageDefaultChoice = selectedPosition ? `position:${selectedPosition.id}` : customPositionText === "Denk dir was aus." ? "surprise" : customPositionText ? "custom" : "";
  const positionError = searchParams?.error === "position-text"
    ? "Bitte gib einen Freitext ein oder wähle eine Szene."
    : searchParams?.error === "position"
      ? "Bitte wähle genau eine Szene, Freitext oder „Denk dir was aus“."
      : "";

  return (
    <AppShell>
      <PageHeader title={isSelfBondageOrder ? "Auftrag bearbeiten" : isIdea ? "Idee bearbeiten" : "Spielplan bearbeiten"} />
      <PageGuide title={isSelfBondageOrder ? "Auftrag bearbeiten" : isIdea ? "Idee bearbeiten" : "Spielplan bearbeiten"}>
        {isSelfBondageOrder
          ? "Passe hier Auftrag, Termin, Status, Anweisung und die ausgewaehlten Szenen an. Loeschen entfernt nur diesen Auftrag."
          : isIdea
            ? "Passe hier Titel, Beschreibung, Status und Bausteine dieser Idee an. Bilder verwaltest du direkt auf der Ideendetailseite."
          : "Passe hier Titel, Termin, Status, Notiz und die verknüpften Spielsachen oder Szenen an. Die URL wird automatisch aus dem Titel gebildet. Löschen entfernt nur diesen Plan, nicht die verwendeten Bausteine."}
      </PageGuide>
      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <form action={updateActivity} className="grid gap-6 xl:grid-cols-[1fr_420px]">
          <input type="hidden" name="id" value={activity.id} />
          <div className="space-y-4">
            <Field label={isSelfBondageOrder ? "Auftrag" : isIdea ? "Idee" : "Spielidee"}><input className={inputClass} name="title" required defaultValue={activity.title} /></Field>
            {isSelfBondageOrder ? (
              <SelfBondageScheduleFields
                mode="edit"
                defaultPlannedAt={formatDateTimeLocal(activity.plannedAt)}
                defaultWithoutSchedule={!activity.plannedAt}
                statusDefault={activity.status}
                statusOptions={statusOptions}
              />
            ) : isIdea ? (
              <Field label="Status">
                <select className={selectClass} name="status" defaultValue={activity.status}>
                  {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </Field>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Datum und Uhrzeit"><input className={inputClass} name="plannedAt" type="datetime-local" step={900} defaultValue={formatDateTimeLocal(activity.plannedAt)} /></Field>
                <Field label="Status">
                  <select className={selectClass} name="status" defaultValue={activity.status}>
                    {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </Field>
              </div>
            )}
            <Field label={isSelfBondageOrder ? "Anweisung" : isIdea ? "Beschreibung" : "Notiz"}><textarea className={inputClass} name="note" rows={6} defaultValue={isSelfBondageOrder ? stripPositionNote(activity.note || "") : activity.note || ""} /></Field>
            <div className="flex flex-wrap gap-2">
              <Button><Save className="h-4 w-4" /> {isSelfBondageOrder ? "Auftrag speichern" : isIdea ? "Idee speichern" : "Änderungen speichern"}</Button>
              <Link href={`/activities/${activity.slug}`} className="focus-ring inline-flex min-h-10 items-center justify-center rounded-md border border-line bg-surface px-4 py-2 text-sm font-semibold hover:bg-paper">
                Abbrechen
              </Link>
            </div>
          </div>
          <div className="space-y-5">
            {!isSelfBondageOrder && toolsEnabled ? <section>
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
            </section> : null}
            {!isSelfBondageOrder && bondageSystemEnabled ? (
              <section>
                <h2 className="mb-2 text-sm font-semibold text-graphite">Bondage-System</h2>
                <div className="space-y-2">
                  {bondageItems.map((item) => (
                    <label key={item.id} className="flex gap-3 rounded-md bg-paper p-3 text-sm">
                      <input name="bondageSystemItems" value={item.id} type="checkbox" defaultChecked={selectedBondageItems.has(item.id)} className="mt-1 h-4 w-4 accent-redbrand" />
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.product.imageUrl || "/toy-placeholder.svg"} alt="" className="h-12 w-12 rounded-md object-cover" />
                      <span><strong className="block">{item.product.title}</strong><span className="text-graphite">{item.product.vendor || "Shopify"}</span></span>
                    </label>
                  ))}
                </div>
              </section>
            ) : null}
            {isSelfBondageOrder ? (
              <SelfBondagePositionChoice
                positions={positions.map((position) => ({ id: position.id, name: position.name }))}
                defaultChoice={selfBondageDefaultChoice}
                defaultCustomText={selfBondageDefaultChoice === "custom" ? customPositionText : ""}
                error={positionError}
              />
            ) : positionsEnabled ? (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-graphite">Szenen</h2>
              <div className="space-y-2">
                {positions.map((position) => (
                  <label key={position.id} className="flex items-center gap-3 rounded-md bg-paper p-3 text-sm">
                    <input name="positions" value={position.id} type="checkbox" defaultChecked={selectedPositions.has(position.id)} className="h-4 w-4 accent-redbrand" />
                    <span className="min-w-0">
                      <span className="block">{position.name}</span>
                      {position.selfBondageCapable ? <span className="block text-xs text-sky-700">Kann beauftragt werden</span> : null}
                    </span>
                  </label>
                ))}
              </div>
            </section>
            ) : null}
          </div>
        </form>
        <form action={deleteActivity} className="rounded-lg border border-line bg-paper p-5">
          <input type="hidden" name="id" value={activity.id} />
          <h2 className="text-lg font-semibold">Löschen</h2>
          <p className="mt-2 text-sm text-graphite">{isSelfBondageOrder ? "Entfernt diesen Auftrag und alle Verknüpfungen dazu." : isIdea ? "Entfernt diese Idee und ihre zugehörigen Bilder." : "Entfernt diesen Spielplan und alle Verknüpfungen dazu."}</p>
          <Button variant="danger" className="mt-4 w-full"><Trash2 className="h-4 w-4" /> {isSelfBondageOrder ? "Auftrag löschen" : isIdea ? "Idee löschen" : "Spielplan löschen"}</Button>
        </form>
      </div>
    </AppShell>
  );
}
