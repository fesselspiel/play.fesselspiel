import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ImagePlus, Pencil, Save, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { CopySubtitle } from "@/components/copy-subtitle";
import { Badge, Button, Field, inputClass, PageGuide, PageHeader, Panel, SoftPanel } from "@/components/ui";
import { confirmRequestedActivity } from "@/lib/activity-actions";
import { activityStatusDisplay, activityStatusTone } from "@/lib/activity-status";
import { isAccessibleOwner, ownerScope } from "@/lib/access";
import { currentUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { deleteOwnedFile, fileAssetUrl, fileIdFromUrl, saveUploadedFile } from "@/lib/files";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/dates";
import { logAction } from "@/lib/audit";

async function addActivityImage(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  const activityId = String(formData.get("activityId") || "");
  const activity = await prisma.activityPlan.findFirst({ where: { id: activityId, ...(await ownerScope(user)) } });
  if (!activity) notFound();
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
      href: `/activities/${activity.slug}`
    });
  }
  redirect(`/activities/${activity.slug}`);
}

async function deleteActivityImage(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  const activityId = String(formData.get("activityId") || "");
  const imageKey = String(formData.get("imageKey") || "");
  const activity = await prisma.activityPlan.findFirst({ where: { id: activityId, ...(await ownerScope(user)) } });
  if (!activity) notFound();
  if (imageKey.startsWith("image:")) {
    const imageId = imageKey.replace("image:", "");
    const image = await prisma.activityImage.findFirst({ where: { id: imageId, activityId: activity.id }, include: { file: true } });
    if (image) {
      await prisma.activityImage.delete({ where: { id: image.id } });
      await deleteOwnedFile(image.file.ownerId, image.file.id);
    }
  } else if (imageKey.startsWith("media:")) {
    const mediaId = imageKey.replace("media:", "");
    const media = await prisma.media.findFirst({ where: { id: mediaId, activityId: activity.id, ...(await ownerScope(user)) } });
    if (media) {
      await prisma.media.delete({ where: { id: media.id } });
      const fileId = fileIdFromUrl(media.url);
      if (fileId) await deleteOwnedFile(media.ownerId, fileId);
    }
  }
  redirect(`/activities/${activity.slug}`);
}

export default async function ActivityDetailPage({ params }: { params: { slug: string } }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const activity = await prisma.activityPlan.findUnique({
    where: { slug: params.slug },
    include: {
      tools: true,
      positions: true,
      images: { include: { file: true }, orderBy: { createdAt: "desc" } },
      media: { orderBy: { createdAt: "desc" } }
    }
  });
  if (!activity || !(await isAccessibleOwner(user, activity.ownerId))) notFound();
  const isSelfBondageOrder = activity.category === "SELF_BONDAGE_ORDER" || activity.category === "Self-Bondage";
  const isIdea = activity.category === "IDEA_COLLECTION";
  const ideaImages = [
    ...activity.images.map((image) => ({
      key: `image:${image.id}`,
      title: image.title,
      url: fileAssetUrl(image.fileId),
      kind: image.file.mimeType.startsWith("video/") ? "VIDEO" : "IMAGE"
    })),
    ...activity.media.map((media) => ({
      key: `media:${media.id}`,
      title: media.title,
      url: media.url,
      kind: media.kind
    }))
  ];
  const path = `/activities/${activity.slug}`;
  const url = `${env.appUrl}${path}`;
  return (
    <AppShell>
      <PageHeader
        title={activity.title}
        subtitle={<CopySubtitle value={url} label={path} />}
        action={
          <Badge tone={activityStatusTone(activity.status)}>{activityStatusDisplay(activity.status, isSelfBondageOrder, isIdea)}</Badge>
        }
      />
      <PageGuide title={isSelfBondageOrder ? "Self-Bondage-Auftrag" : isIdea ? "Idee mit Bildern" : "Spielplan im Detail"}>
        {isSelfBondageOrder
          ? "Diese Detailseite zeigt den Auftrag, den Termin, den Status und die ausgewählten Self-Bondage-fähigen Szenen. Nutze Bearbeiten, um die Anweisung oder die Szenen zu ändern."
          : isIdea
            ? "Diese Detailseite sammelt eine Idee, passende Bausteine und Bilder, die nur zu dieser Idee gehören."
          : "Diese Detailseite zeigt Termin, Notiz, Status und alle ausgewählten Bausteine eines Spielplans. Nutze Bearbeiten, um Status, Termin oder Verknüpfungen nachträglich zu ändern."}
      </PageGuide>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Panel>
        <p className="text-sm text-graphite">{isSelfBondageOrder ? "Auftrag" : isIdea ? "Idee" : activity.category || "Spielidee"} · {isIdea ? "irgendwann ausprobieren" : isSelfBondageOrder && !activity.plannedAt ? "gilt sofort beim Lesen" : formatDateTime(activity.plannedAt)}</p>
          {activity.status === "REQUESTED" && activity.ownerId !== user.id ? (
            <form action={confirmRequestedActivity} className="mt-4">
              <input type="hidden" name="id" value={activity.id} />
              <Button>{isSelfBondageOrder ? "Auftrag annehmen" : "Spielplan bestätigen"}</Button>
            </form>
          ) : null}
          <p className="mt-5 leading-7 text-graphite">{activity.note || "Keine Notiz hinterlegt."}</p>
        </Panel>
        <div className="space-y-6">
          {!isSelfBondageOrder ? <SoftPanel>
            <h2 className="mb-3 text-lg font-semibold">Spielsachen</h2>
            <div className="space-y-2">
              {activity.tools.map((toy) => <Link key={toy.id} href={`/toys/${toy.slug}`} className="block rounded-md bg-paper px-3 py-2 text-sm text-ink hover:text-redbrand">{toy.title}</Link>)}
              {!activity.tools.length ? <p className="text-sm text-graphite">Keine Spielsachen ausgewählt.</p> : null}
            </div>
          </SoftPanel> : null}
          <SoftPanel>
            <h2 className="mb-3 text-lg font-semibold">{isSelfBondageOrder ? "Self-Bondage-fähige Szenen" : "Szenen"}</h2>
            <div className="space-y-2">
              {activity.positions.map((position) => <Link key={position.id} href={`/positions/${position.slug}`} className="block rounded-md bg-paper px-3 py-2 text-sm text-ink hover:text-redbrand">{position.name}</Link>)}
              {!activity.positions.length ? <p className="text-sm text-graphite">Keine Szene ausgewählt.</p> : null}
            </div>
          </SoftPanel>
        </div>
      </div>
      {isIdea ? (
        <Panel className="mt-6">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold"><ImagePlus className="h-5 w-5 text-redbrand" /> Bilder zur Idee</h2>
          {activity.ownerId === user.id ? (
            <form action={addActivityImage} className="mb-5 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end" encType="multipart/form-data">
              <input type="hidden" name="activityId" value={activity.id} />
              <Field label="Bilder"><input className={inputClass} name="files" type="file" accept="image/*" multiple required /></Field>
              <Button><Save className="h-4 w-4" /> Hochladen</Button>
            </form>
          ) : null}
          {ideaImages.length ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {ideaImages.map((image) => (
                <article key={image.key} className="overflow-hidden rounded-lg border border-line bg-paper">
                  {image.kind === "IMAGE" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={image.url} alt={image.title} className="aspect-square w-full object-cover" />
                  ) : (
                    <video src={image.url} className="aspect-square w-full object-cover" controls />
                  )}
                  <div className="flex items-center justify-between gap-3 p-3">
                    <h3 className="min-w-0 truncate text-sm font-semibold text-ink">{image.title}</h3>
                    {activity.ownerId === user.id ? (
                      <form action={deleteActivityImage}>
                        <input type="hidden" name="activityId" value={activity.id} />
                        <input type="hidden" name="imageKey" value={image.key} />
                        <button className="focus-ring inline-flex min-h-9 items-center gap-1 rounded-md border border-redbrand/30 px-2 py-1 text-xs font-semibold text-redbrand hover:bg-redbrand/10">
                          <Trash2 className="h-3.5 w-3.5" />
                          Entfernen
                        </button>
                      </form>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="rounded-md border border-dashed border-line bg-paper p-4 text-sm text-graphite">Noch keine Bilder zu dieser Idee.</p>
          )}
        </Panel>
      ) : null}
      <Panel className="mt-6">
        <h2 className="mb-2 text-lg font-semibold">Aktionen</h2>
        <p className="mb-4 text-sm text-graphite">{isSelfBondageOrder ? "Bearbeite diesen Auftrag, wenn Termin, Status, Anweisung oder Szenen geändert werden sollen." : "Bearbeite diesen Spielplan, wenn Termin, Status, Notiz oder Bausteine geändert werden sollen."}</p>
        <Link href={`/activities/${activity.slug}/edit`} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-line bg-surface px-4 py-2 text-sm font-semibold hover:bg-paper">
          <Pencil className="h-4 w-4" />
          Bearbeiten
        </Link>
      </Panel>
    </AppShell>
  );
}
