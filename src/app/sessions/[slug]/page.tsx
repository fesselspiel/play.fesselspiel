import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ImagePlus, MessageCircle, Pencil, Save } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, Field, inputClass, PageGuide, PageHeader, Panel, SoftPanel } from "@/components/ui";
import { logAction } from "@/lib/audit";
import { ownerScope } from "@/lib/access";
import { ensureDefaultAlbum } from "@/lib/albums";
import { currentUser } from "@/lib/auth";
import { formatDateTime, formatMinutes } from "@/lib/dates";
import { fileAssetUrl, saveUploadedFile } from "@/lib/files";
import { moodAfter, moodBefore, neutralMood } from "@/lib/moods";
import { prisma } from "@/lib/prisma";
import { ensureSessionSlug } from "@/lib/session-slug";

async function addSessionMedia(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  const sessionId = String(formData.get("sessionId") || "");
  const session = await prisma.segufixSession.findFirst({ where: { id: sessionId, ...(await ownerScope(user)) } });
  if (!session) notFound();
  const asset = await saveUploadedFile(user.id, formData.get("file") as File | null);
  if (!asset) redirect(`/sessions/${await ensureSessionSlug(session)}`);
  const album = await ensureDefaultAlbum(user.id);
  await prisma.media.create({
    data: {
      ownerId: user.id,
      albumId: album.id,
      sessionId: session.id,
      title: String(formData.get("title") || asset.originalName || "Session Bild").trim(),
      kind: asset.mimeType.startsWith("video/") ? "VIDEO" : "IMAGE",
      url: fileAssetUrl(asset.id),
      visibility: "PRIVATE"
    }
  });
  await logAction({
    actorId: user.id,
    action: "session_media_uploaded",
    entityType: "session",
    entityId: session.id,
    title: "Bild zur Session hochgeladen",
    href: `/sessions/${await ensureSessionSlug(session)}`
  });
  redirect(`/sessions/${await ensureSessionSlug(session)}`);
}

async function addSessionComment(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  const sessionId = String(formData.get("sessionId") || "");
  const body = String(formData.get("body") || "").trim();
  const session = await prisma.segufixSession.findFirst({ where: { id: sessionId, ...(await ownerScope(user)) } });
  if (!session) notFound();
  if (body) {
    await prisma.sessionComment.create({ data: { sessionId: session.id, ownerId: user.id, body } });
    await logAction({
      actorId: user.id,
      action: "session_commented",
      entityType: "session",
      entityId: session.id,
      title: "Session kommentiert",
      href: `/sessions/${await ensureSessionSlug(session)}#comments`
    });
  }
  redirect(`/sessions/${await ensureSessionSlug(session)}#comments`);
}

async function addMediaComment(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  const sessionId = String(formData.get("sessionId") || "");
  const mediaId = String(formData.get("mediaId") || "");
  const body = String(formData.get("body") || "").trim();
  const session = await prisma.segufixSession.findFirst({ where: { id: sessionId, ...(await ownerScope(user)) } });
  if (!session) notFound();
  const media = await prisma.media.findFirst({ where: { id: mediaId, sessionId: session.id, ...(await ownerScope(user)) } });
  if (media && body) {
    await prisma.mediaComment.create({ data: { mediaId: media.id, ownerId: user.id, body } });
    await logAction({
      actorId: user.id,
      action: "session_media_commented",
      entityType: "session",
      entityId: session.id,
      title: "Session-Bild kommentiert",
      href: `/sessions/${await ensureSessionSlug(session)}#media-${mediaId}`
    });
  }
  redirect(`/sessions/${await ensureSessionSlug(session)}#media-${mediaId}`);
}

export default async function SessionDetailPage({ params }: { params: { slug: string } }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const session = await prisma.segufixSession.findFirst({
    where: {
      ...(await ownerScope(user)),
      OR: [{ slug: params.slug }, { id: params.slug }]
    },
    include: {
      media: {
        include: {
          comments: {
            include: { owner: { select: { name: true, username: true, email: true, profile: true } } },
            orderBy: { createdAt: "asc" }
          }
        },
        orderBy: { createdAt: "desc" }
      },
      comments: {
        include: { owner: { select: { name: true, username: true, email: true, profile: true } } },
        orderBy: { createdAt: "asc" }
      }
    }
  });
  if (!session) notFound();
  const slug = await ensureSessionSlug(session);
  if (params.slug !== slug) redirect(`/sessions/${slug}`);
  await logAction({
    actorId: user.id,
    action: "session_viewed",
    entityType: "session",
    entityId: session.id,
    title: "Session aufgerufen",
    href: `/sessions/${slug}`
  });
  const sessionComment = [
    session.notes,
    session.moodBeforeText ? `Vorher: ${session.moodBeforeText}` : "",
    session.moodAfterText ? `Nachher: ${session.moodAfterText}` : ""
  ].filter(Boolean).join("\n");

  return (
    <AppShell>
      <PageHeader
        title="Session"
        subtitle={`${formatDateTime(session.startTime)} · ${formatMinutes(session.durationMinutes)}`}
        action={
          <Link href={`/sessions/${slug}/edit`} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-line bg-surface px-4 py-2 text-sm font-semibold hover:bg-paper">
            <Pencil className="h-4 w-4" />
            Bearbeiten
          </Link>
        }
      />
      <PageGuide title="Session-Details, Bilder und Kommentare">
        Diese Detailseite sammelt Zeiten, Stimmungen, Sessionkommentar, Bilder und Kommentare zu einer Session. Lade Bilder hoch, kommentiere einzelne Medien oder füge einen Kommentar zur Session insgesamt hinzu.
      </PageGuide>

      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SoftPanel>
            <div className="text-sm text-graphite">Start</div>
            <div className="mt-2 font-semibold text-ink">{formatDateTime(session.startTime)}</div>
          </SoftPanel>
          <SoftPanel>
            <div className="text-sm text-graphite">Ende</div>
            <div className="mt-2 font-semibold text-ink">{session.endTime ? formatDateTime(session.endTime) : neutralMood}</div>
          </SoftPanel>
          <SoftPanel>
            <div className="text-sm text-graphite">Stimmung vorher</div>
            <div className="mt-2 font-semibold text-ink">{session.moodBefore ? moodBefore[session.moodBefore] : neutralMood}</div>
          </SoftPanel>
          <SoftPanel>
            <div className="text-sm text-graphite">Stimmung nachher</div>
            <div className="mt-2 font-semibold text-ink">{session.moodAfter ? moodAfter[session.moodAfter] : neutralMood}</div>
          </SoftPanel>
        </div>

        <Panel>
          <h2 className="mb-3 text-lg font-semibold">Sessionkommentar</h2>
          <p className="whitespace-pre-wrap text-sm leading-6 text-graphite">{sessionComment || "Kein Kommentar hinterlegt."}</p>
        </Panel>

        <Panel>
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold"><ImagePlus className="h-5 w-5 text-redbrand" /> Bilder zur Session</h2>
          <form action={addSessionMedia} className="mb-5 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" encType="multipart/form-data">
            <input type="hidden" name="sessionId" value={session.id} />
            <Field label="Titel"><input className={inputClass} name="title" placeholder="Session Bild" /></Field>
            <Field label="Bild"><input className={inputClass} name="file" type="file" accept="image/*" required /></Field>
            <Button><Save className="h-4 w-4" /> Hochladen</Button>
          </form>

          {session.media.length ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {session.media.map((media) => (
                <article key={media.id} id={`media-${media.id}`} className="overflow-hidden rounded-lg border border-line bg-paper">
                  {media.kind === "IMAGE" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={media.url} alt={media.title} className="aspect-square w-full object-cover" />
                  ) : (
                    <video src={media.url} className="aspect-square w-full object-cover" controls />
                  )}
                  <div className="space-y-3 p-3">
                    <h3 className="font-semibold text-ink">{media.title}</h3>
                    <div className="space-y-2">
                      {media.comments.map((comment) => {
                        const owner = comment.owner.profile?.displayName || comment.owner.name || comment.owner.username || comment.owner.email;
                        return <p key={comment.id} className="rounded-md bg-surface p-2 text-sm text-graphite"><strong className="text-ink">{owner}:</strong> {comment.body}</p>;
                      })}
                    </div>
                    <form action={addMediaComment} className="space-y-2">
                      <input type="hidden" name="sessionId" value={session.id} />
                      <input type="hidden" name="mediaId" value={media.id} />
                      <textarea className={inputClass} name="body" rows={2} placeholder="Bild kommentieren" required />
                      <Button><MessageCircle className="h-4 w-4" /> Kommentar</Button>
                    </form>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="rounded-md border border-dashed border-line bg-paper p-4 text-sm text-graphite">Noch keine Bilder zu dieser Session.</p>
          )}
        </Panel>

        <Panel>
          <h2 id="comments" className="mb-4 text-lg font-semibold">Session-Kommentare</h2>
          <div className="mb-4 space-y-2">
            {session.comments.map((comment) => {
              const owner = comment.owner.profile?.displayName || comment.owner.name || comment.owner.username || comment.owner.email;
              return <p key={comment.id} className="rounded-md bg-paper p-3 text-sm text-graphite"><strong className="text-ink">{owner}:</strong> {comment.body}</p>;
            })}
            {!session.comments.length ? <p className="text-sm text-graphite">Noch keine Kommentare.</p> : null}
          </div>
          <form action={addSessionComment} className="space-y-3">
            <input type="hidden" name="sessionId" value={session.id} />
            <textarea className={inputClass} name="body" rows={3} placeholder="Session kommentieren" required />
            <Button><MessageCircle className="h-4 w-4" /> Kommentar speichern</Button>
          </form>
        </Panel>
      </div>
    </AppShell>
  );
}
