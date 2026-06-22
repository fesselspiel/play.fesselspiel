import { redirect } from "next/navigation";
import { Save } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { FileUploadField } from "@/components/file-upload-field";
import { SelfBondagePositionChoice } from "@/components/self-bondage-position-choice";
import { SelfBondageScheduleFields } from "@/components/self-bondage-schedule-fields";
import { Button, Field, inputClass, PageGuide, PageHeader, selectClass } from "@/components/ui";
import { bondageSystemVisibilityScope, ownerScope } from "@/lib/access";
import { activityStatusOptions, type ActivityStatusValue, quarterHourOptions } from "@/lib/activity-status";
import { logAction } from "@/lib/audit";
import { currentUser } from "@/lib/auth";
import { hasFeature, requireFeature } from "@/lib/features";
import { fileIdFromUrl, saveUploadedFile } from "@/lib/files";
import { selfBondageCategory } from "@/lib/activity-orders";
import { prisma } from "@/lib/prisma";
import { normalizeSlug, uniqueSlug } from "@/lib/slug";

function selfBondagePositionNote(choice: string, customText: string) {
  if (choice === "custom") return `Szene: ${customText}`;
  if (choice === "surprise") return "Szene: Denk dir was aus.";
  return "";
}

function appendSelfBondagePositionNote(note: string, choice: string, customText: string) {
  const positionNote = selfBondagePositionNote(choice, customText);
  return [note, positionNote].filter(Boolean).join("\n\n");
}

async function createActivity(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  await requireFeature("activities");
  const selfBondageTemplate = String(formData.get("template") || "") === "self-bondage";
  const ideaTemplate = String(formData.get("template") || "") === "idea";
  if (selfBondageTemplate) await requireFeature("orders");
  const title = String(formData.get("title") || "").trim();
  const slug = await uniqueSlug("activityPlan", normalizeSlug(String(formData.get("slug") || ""), title), user.tenantId);
  const date = String(formData.get("date") || "");
  const time = String(formData.get("time") || "");
  const withoutSchedule = selfBondageTemplate && formData.get("noSchedule") === "on";
  const plannedAt = !ideaTemplate && !withoutSchedule && date ? new Date(`${date}T${time || "20:00"}:00`) : null;
  const toolsEnabled = await hasFeature("toys");
  const positionsEnabled = await hasFeature("positions");
  const bondageSystemEnabled = await hasFeature("shopifyBondageSystem");
  const toolIds = selfBondageTemplate || !toolsEnabled ? [] : formData.getAll("tools").map(String);
  const bondageItemIds = selfBondageTemplate || !bondageSystemEnabled ? [] : formData.getAll("bondageSystemItems").map(String);
  const selfBondageChoice = String(formData.get("selfBondageChoice") || "");
  const selfBondageCustomText = String(formData.get("selfBondageCustomText") || "").trim();
  if (selfBondageTemplate && !selfBondageChoice) redirect("/activities/new?template=self-bondage&error=position");
  if (selfBondageTemplate && selfBondageChoice === "custom" && !selfBondageCustomText) redirect("/activities/new?template=self-bondage&error=position-text");
  const positionIds = selfBondageTemplate
    ? selfBondageChoice.startsWith("position:") ? [selfBondageChoice.replace("position:", "")].filter(Boolean) : []
    : positionsEnabled ? formData.getAll("positions").map(String) : [];
  const scope = await ownerScope(user);
  const [accessibleTools, accessiblePositions, accessibleBondageItems] = await Promise.all([
    toolIds.length ? prisma.toy.findMany({ where: { ...scope, id: { in: toolIds } }, select: { id: true } }) : [],
    positionIds.length ? prisma.position.findMany({ where: { ...scope, id: { in: positionIds }, ...(selfBondageTemplate ? { selfBondageCapable: true } : {}) }, select: { id: true } }) : [],
    bondageItemIds.length ? prisma.bondageSystemItem.findMany({ where: { tenantId: user.tenantId || undefined, id: { in: bondageItemIds }, visible: true, ...bondageSystemVisibilityScope(user) }, select: { id: true } }) : []
  ]);
  if (selfBondageTemplate && selfBondageChoice.startsWith("position:") && accessiblePositions.length !== 1) redirect("/activities/new?template=self-bondage&error=position");
  const status = String(formData.get("status") || "REQUESTED") as ActivityStatusValue;
  const note = selfBondageTemplate
    ? appendSelfBondagePositionNote(String(formData.get("note") || "").trim(), selfBondageChoice, selfBondageCustomText)
    : String(formData.get("note") || "").trim();
  const activity = await prisma.activityPlan.create({
    data: {
      tenantId: user.tenantId || undefined,
      ownerId: user.id,
      title,
      slug,
      category: selfBondageTemplate ? selfBondageCategory : ideaTemplate ? "IDEA_COLLECTION" : null,
      note,
      plannedAt,
      status,
      tools: { connect: accessibleTools.map(({ id }) => ({ id })) },
      bondageSystemItems: { connect: accessibleBondageItems.map(({ id }) => ({ id })) },
      positions: { connect: accessiblePositions.map(({ id }) => ({ id })) }
    }
  });
  if (ideaTemplate) {
    const uploadedImageUrl = String(formData.get("ideaImageUploadedUrl") || "");
    const uploadedFileId = fileIdFromUrl(uploadedImageUrl);
    if (uploadedImageUrl && uploadedFileId) {
      const asset = await prisma.fileAsset.findFirst({ where: { id: uploadedFileId, ownerId: user.id } });
      if (asset) {
        await prisma.activityImage.create({
          data: {
            activityId: activity.id,
            fileId: asset.id,
            title: asset.originalName || "Ideenbild"
          }
        });
      }
    }
    const files = formData.getAll("files").filter((file): file is File => file instanceof File && file.size > 0);
    for (const file of files) {
      const asset = await saveUploadedFile(user.id, file);
      if (!asset) continue;
      await prisma.activityImage.create({
        data: {
          activityId: activity.id,
          fileId: asset.id,
          title: asset.originalName || "Ideenbild"
        }
      });
    }
    if (files.length) {
      await logAction({
        actorId: user.id,
        action: "idea_media_uploaded",
        entityType: "activity",
        entityId: activity.id,
        title: `Bilder zur Idee hochgeladen: ${activity.title}`,
        href: `/ideas/${activity.slug}`
      });
    }
    if (uploadedFileId) {
      await logAction({
        actorId: user.id,
        action: "idea_media_uploaded",
        entityType: "activity",
        entityId: activity.id,
        title: `Bild zur Idee hochgeladen: ${activity.title}`,
        href: `/ideas/${activity.slug}`
      });
    }
  }
  await logAction({
    actorId: user.id,
    action: selfBondageTemplate ? "self_bondage_order_created" : ideaTemplate ? "idea_created" : status === "REQUESTED" ? "activity_requested" : "activity_created",
    entityType: "activity",
    entityId: activity.id,
    title: `${selfBondageTemplate ? "Self-Bondage-Auftrag erteilt" : ideaTemplate ? "Idee festgehalten" : status === "REQUESTED" ? "Spielplan angefragt" : "Spielplan angelegt"}: ${activity.title}`,
    details: selfBondageTemplate ? { status: "beauftragt", excludeActorFromTargets: true } : undefined,
    href: selfBondageTemplate ? `/orders#order-${activity.id}` : ideaTemplate ? `/ideas/${activity.slug}` : `/activities/${activity.slug}`
  });
  redirect(selfBondageTemplate ? "/orders" : ideaTemplate ? `/ideas/${slug}` : `/activities/${slug}`);
}

export default async function NewActivityPage({ searchParams }: { searchParams?: { date?: string; template?: string; error?: string } }) {
  await requireFeature("activities");
  const user = await currentUser();
  if (!user) redirect("/login");
  const selfBondageTemplate = searchParams?.template === "self-bondage";
  if (selfBondageTemplate) await requireFeature("orders");
  const toolsEnabled = await hasFeature("toys");
  const positionsEnabled = await hasFeature("positions");
  const bondageSystemEnabled = await hasFeature("shopifyBondageSystem");
  const scope = await ownerScope(user);
  const [toys, positions, bondageItems] = await Promise.all([
    toolsEnabled ? prisma.toy.findMany({ where: scope, orderBy: [{ sortOrder: "asc" }, { title: "asc" }] }) : [],
    positionsEnabled ? prisma.position.findMany({ where: { ...scope, ...(selfBondageTemplate ? { selfBondageCapable: true } : {}) }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }) : [],
    bondageSystemEnabled ? prisma.bondageSystemItem.findMany({ where: { tenantId: user.tenantId || undefined, visible: true, ...bondageSystemVisibilityScope(user) }, include: { product: true }, orderBy: [{ sortOrder: "asc" }, { product: { title: "asc" } }] }) : []
  ]);
  const defaultDate = String(searchParams?.date || "").match(/^\d{4}-\d{2}-\d{2}$/) ? String(searchParams?.date) : "";
  const ideaTemplate = searchParams?.template === "idea";
  const defaultTitle = selfBondageTemplate ? "Self-Bondage-Auftrag" : "";
  const defaultNote = selfBondageTemplate
    ? "Auftrag: Bring dich in die ausgewählte Lage und richte dich so ein, dass du ruhig warten kannst. Dokumentiere danach kurz, wie die Vorbereitung funktioniert hat."
    : ideaTemplate
      ? "Warum wollen wir das ausprobieren? Was brauchen wir dafür?"
    : "";
  const statusOptions = activityStatusOptions(selfBondageTemplate, ideaTemplate);
  const timeOptions = quarterHourOptions();
  const positionError = searchParams?.error === "position-text"
    ? "Bitte gib einen Freitext ein oder wähle eine Szene."
    : searchParams?.error === "position"
      ? "Bitte wähle genau eine Szene, Freitext oder „Denk dir was aus“."
      : "";
  return (
    <AppShell>
      <PageHeader title={selfBondageTemplate ? "Self-Bondage-Auftrag" : ideaTemplate ? "Idee festhalten" : "Lass uns spielen"} />
      <PageGuide title={selfBondageTemplate ? "Auftrag zum Vorbereiten" : ideaTemplate ? "Ideensammlung" : "Spielideen aus dem Baukastensystem"}>
        {selfBondageTemplate
          ? "Erstelle hier einen Auftrag, bei dem eine Person sich selbst in eine passende Lage bringt. Es werden nur Szenen angeboten, die als Self-Bondage-fähig markiert sind."
          : ideaTemplate
            ? "Halte hier eine Idee fest, die ihr irgendwann ausprobieren wollt. Bilder kannst du direkt beim Anlegen auswählen und später auf der Detailseite ergänzen."
          : "Erstelle hier einen konkreten Spielplan. Vergib Titel und Kategorie, setze optional Datum und Uhrzeit, Wähle passende Spielsachen und Szenen aus und speichere den Plan mit dem gewünschten Status."}
      </PageGuide>
      <form action={createActivity} className="grid gap-6 xl:grid-cols-[1fr_420px]" encType="multipart/form-data">
        {selfBondageTemplate ? <input type="hidden" name="template" value="self-bondage" /> : null}
        {ideaTemplate ? <input type="hidden" name="template" value="idea" /> : null}
        <div className="space-y-4">
          <Field label={selfBondageTemplate ? "Auftrag" : ideaTemplate ? "Idee" : "Spieltermin"}><input className={inputClass} name="title" required placeholder={selfBondageTemplate ? "Self-Bondage-Auftrag" : ideaTemplate ? "Das wollen wir ausprobieren" : "Entspannungsabend"} defaultValue={defaultTitle} /></Field>
          {selfBondageTemplate || ideaTemplate ? null : (
            <Field label="URL-Slug"><input className={inputClass} name="slug" pattern="[a-z0-9-]*" placeholder="entspannungsabend" /></Field>
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
          ) : ideaTemplate ? (
            <Field label="Status">
              <select className={selectClass} name="status" defaultValue="PLANNED">
                {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </Field>
          ) : (
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Datum"><input className={inputClass} name="date" type="date" defaultValue={defaultDate} /></Field>
              <Field label="Uhrzeit">
                <select className={selectClass} name="time" defaultValue="20:00">
                  {timeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </Field>
              <Field label="Status">
                <select className={selectClass} name="status" defaultValue="REQUESTED">
                  {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </Field>
            </div>
          )}
          <Field label={selfBondageTemplate ? "Anweisung" : ideaTemplate ? "Beschreibung" : "Notiz"}><textarea className={inputClass} name="note" rows={6} defaultValue={defaultNote} /></Field>
          {ideaTemplate ? (
            <FileUploadField
              name="files"
              uploadedUrlName="ideaImageUploadedUrl"
              label="Bild zur Idee"
              accept="image/*"
              help="Bild auswählen, Ausschnitt festlegen und Idee speichern."
              imageCropAspect="landscape"
            />
          ) : null}
          <Button><Save className="h-4 w-4" /> {selfBondageTemplate ? "Auftrag speichern" : ideaTemplate ? "Idee speichern" : "Plan speichern"}</Button>
        </div>
        <div className="space-y-5">
          {!selfBondageTemplate && toolsEnabled ? <section>
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
          {!selfBondageTemplate && bondageSystemEnabled ? (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-graphite">Bondage-System</h2>
              <div className="space-y-2">
                {bondageItems.map((item) => (
                  <label key={item.id} className="flex gap-3 rounded-md bg-paper p-3 text-sm">
                    <input name="bondageSystemItems" value={item.id} type="checkbox" className="mt-1 h-4 w-4 accent-redbrand" />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.product.imageUrl || "/toy-placeholder.svg"} alt="" className="h-12 w-12 rounded-md object-cover" />
                    <span><strong className="block">{item.product.title}</strong><span className="text-graphite">{item.product.vendor || "Shopify"}</span></span>
                  </label>
                ))}
              </div>
            </section>
          ) : null}
          {selfBondageTemplate ? (
            <SelfBondagePositionChoice
              positions={positions.map((position) => ({ id: position.id, name: position.name }))}
              error={positionError}
            />
          ) : positionsEnabled ? (
          <section>
            <h2 className="mb-2 text-sm font-semibold text-graphite">Szenen</h2>
            <div className="space-y-2">
              {positions.map((position) => (
                <label key={position.id} className="flex items-center gap-3 rounded-md bg-paper p-3 text-sm">
                  <input name="positions" value={position.id} type="checkbox" className="h-4 w-4 accent-redbrand" />
                  <span className="min-w-0">
                    <span className="block font-medium">{position.name}</span>
                    {position.selfBondageCapable ? <span className="block text-xs text-sky-700">Self-Bondage-fähig</span> : null}
                  </span>
                </label>
              ))}
            </div>
          </section>
          ) : null}
        </div>
      </form>
    </AppShell>
  );
}
