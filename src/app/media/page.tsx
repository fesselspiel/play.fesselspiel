import { redirect } from "next/navigation";
import Link from "next/link";
import {
  CalendarDays,
  Download,
  Eye,
  FileLock2,
  Film,
  Folder,
  Image as ImageIcon,
  MessageCircle,
  Plus,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  X
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { FileUploadField } from "@/components/file-upload-field";
import { QuickAlbumForm } from "@/components/quick-album-form";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Button, EmptyState, Field, inputClass, PageGuide, PageHeader, selectClass } from "@/components/ui";
import { mediaVisibilityScope, ownerScope, visibilityScope } from "@/lib/access";
import { ensureDefaultAlbum, isDefaultAlbumTitle } from "@/lib/albums";
import { currentUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { deleteOwnedFile, fileAssetUrl, fileIdFromUrl, saveUploadedFile } from "@/lib/files";
import { prisma } from "@/lib/prisma";

type MediaSearchParams = {
  album?: string;
  kind?: string;
  visibility?: string;
  q?: string;
  view?: string;
};

function parsedVisibility(value: FormDataEntryValue | null) {
  const raw = String(value || "");
  if (raw === "PRIVATE" || raw === "PARTNER" || raw === "SHARED") return raw;
  return null;
}

async function createMedia(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  const file = await saveUploadedFile(user.id, formData.get("file") as File | null);
  if (!file) redirect("/media");
  const selectedAlbumId = String(formData.get("albumId") || "");
  const scope = await ownerScope(user);
  const selectedAlbum = selectedAlbumId ? await prisma.album.findFirst({ where: { id: selectedAlbumId, ...scope } }) : null;
  const targetAlbum = selectedAlbum || (await ensureDefaultAlbum(user.id));
  const kind = file.mimeType.startsWith("video/") ? "VIDEO" : "IMAGE";
  await prisma.media.create({
    data: {
      ownerId: user.id,
      albumId: targetAlbum.id,
      title: String(formData.get("title") || "").trim(),
      kind,
      url: fileAssetUrl(file.id),
      visibility: parsedVisibility(formData.get("visibility"))
    }
  });
  redirect("/media");
}

async function deleteMedia(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id") || "");
  const media = await prisma.media.findFirst({ where: { id, ...(await ownerScope(user)) } });
  if (!media) redirect("/media");
  await prisma.media.delete({ where: { id: media.id } });
  const fileId = fileIdFromUrl(media.url);
  if (fileId) await deleteOwnedFile(media.ownerId, fileId);
  redirect("/media");
}

async function createAlbum(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  const title = String(formData.get("title") || "").trim();
  if (!title) redirect("/media");
  if (await isDefaultAlbumTitle(user.id, title)) {
    await ensureDefaultAlbum(user.id);
    redirect("/media");
  }
  await prisma.album.create({
    data: {
      ownerId: user.id,
      title,
      description: String(formData.get("description") || "").trim(),
      visibility: String(formData.get("visibility") || "PRIVATE") as "PRIVATE" | "PARTNER" | "SHARED"
    }
  });
  redirect("/media");
}

async function updateAlbum(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  const albumId = String(formData.get("albumId") || "");
  const album = await prisma.album.findFirst({ where: { id: albumId, ...(await ownerScope(user)) } });
  if (!album) redirect("/media");
  const defaultAlbum = await ensureDefaultAlbum(album.ownerId);
  const requestedTitle = String(formData.get("title") || album.title).trim() || album.title;
  const nextTitle = await isDefaultAlbumTitle(album.ownerId, requestedTitle) && album.id !== defaultAlbum.id ? album.title : requestedTitle;
  await prisma.album.update({
    where: { id: album.id },
    data: {
      title: nextTitle,
      description: String(formData.get("description") || "").trim(),
      visibility: String(formData.get("visibility") || album.visibility) as "PRIVATE" | "PARTNER" | "SHARED"
    }
  });
  redirect("/media");
}

async function createAlbumForMedia(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  const scope = await ownerScope(user);
  const mediaId = String(formData.get("mediaId") || "");
  const title = String(formData.get("title") || "").trim();
  const media = await prisma.media.findFirst({ where: { id: mediaId, ...scope } });
  if (!media || !title) redirect("/media");
  if (await isDefaultAlbumTitle(user.id, title)) {
    const album = await ensureDefaultAlbum(user.id);
    await prisma.media.update({ where: { id: media.id }, data: { albumId: album.id, visibility: null } });
    redirect(mediaUrl({ album: album.id, view: media.id }));
  }
  const album = await prisma.album.create({
    data: {
      ownerId: user.id,
      title,
      description: "",
      visibility: String(formData.get("visibility") || "PRIVATE") as "PRIVATE" | "PARTNER" | "SHARED"
    }
  });
  await prisma.media.update({ where: { id: media.id }, data: { albumId: album.id, visibility: null } });
  redirect(mediaUrl({ album: album.id, view: media.id }));
}

async function updateMediaSettings(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  const scope = await ownerScope(user);
  const mediaId = String(formData.get("mediaId") || "");
  const albumId = String(formData.get("albumId") || "");
  const next = String(formData.get("next") || "/media");
  const media = await prisma.media.findFirst({ where: { id: mediaId, ...scope } });
  if (!media) redirect("/media");
  const album = await prisma.album.findFirst({ where: { id: albumId, ...scope } });
  if (!album) redirect(next);
  await prisma.media.update({
    where: { id: media.id },
    data: {
      albumId: album.id,
      visibility: parsedVisibility(formData.get("visibility"))
    }
  });
  redirect(next);
}

async function addMediaToAlbum(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  const scope = await ownerScope(user);
  const albumId = String(formData.get("albumId") || "");
  const mediaIds = formData.getAll("mediaIds").map(String).filter(Boolean);
  const album = albumId ? await prisma.album.findFirst({ where: { id: albumId, ...scope } }) : null;
  if (!album || mediaIds.length === 0) redirect("/media");
  await prisma.media.updateMany({
    where: { ...scope, id: { in: mediaIds } },
    data: { albumId: album.id, visibility: null }
  });
  redirect(mediaUrl({ album: album.id }));
}

async function deleteAlbum(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  const id = String(formData.get("albumId") || "");
  const album = await prisma.album.findFirst({ where: { id, ...(await ownerScope(user)) } });
  if (!album) redirect("/media");
  const fallback = await ensureDefaultAlbum(album.ownerId);
  if (album.id === fallback.id) redirect("/media");
  const media = await prisma.media.findMany({ where: { albumId: album.id } });
  if (formData.get("deleteMedia") === "on") {
    for (const entry of media) {
      await prisma.media.delete({ where: { id: entry.id } });
      const fileId = fileIdFromUrl(entry.url);
      if (fileId) await deleteOwnedFile(entry.ownerId, fileId);
    }
  } else {
    await prisma.media.updateMany({ where: { albumId: album.id }, data: { albumId: fallback.id } });
  }
  await prisma.album.delete({ where: { id: album.id } });
  redirect("/media");
}

async function createMediaComment(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  const mediaId = String(formData.get("mediaId") || "");
  const body = String(formData.get("body") || "").trim();
  const next = String(formData.get("next") || "/media");
  if (!body) redirect(next);
  const media = await prisma.media.findFirst({ where: { id: mediaId, ...(await ownerScope(user)) } });
  if (!media) redirect("/media");
  await prisma.mediaComment.create({
    data: {
      mediaId: media.id,
      ownerId: user.id,
      body
    }
  });
  redirect(next);
}

function formatBytes(value?: number | null) {
  if (!value) return "-";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function visibilityLabel(value: string) {
  if (value === "PRIVATE") return "Nur ich";
  if (value === "PARTNER") return "Zirkel";
  return "Alle";
}

function effectiveVisibility(entry: { visibility: "PRIVATE" | "PARTNER" | "SHARED" | null; album?: { visibility: "PRIVATE" | "PARTNER" | "SHARED" } | null }) {
  return entry.visibility || entry.album?.visibility || "PRIVATE";
}

function visibilityModeLabel(entry: { visibility: "PRIVATE" | "PARTNER" | "SHARED" | null; album?: { visibility: "PRIVATE" | "PARTNER" | "SHARED"; title: string } | null }) {
  if (entry.visibility) return visibilityLabel(entry.visibility);
  return `Wie Album: ${visibilityLabel(entry.album?.visibility || "PRIVATE")}`;
}

function mediaTypeLabel(value: string) {
  return value === "VIDEO" ? "Video" : "Bild";
}

type AlbumForUi = {
  id: string;
  ownerId: string;
  title: string;
  owner?: {
    email: string;
    username: string | null;
    name: string | null;
    profile?: { displayName: string | null } | null;
  } | null;
};

function albumOwnerLabel(album: AlbumForUi) {
  return album.owner?.profile?.displayName || album.owner?.name || album.owner?.username || album.owner?.email || "Unbekannt";
}

function albumLabel(album: AlbumForUi, currentUserId: string, allAlbums: AlbumForUi[]) {
  const duplicateTitle = allAlbums.some((entry) => entry.id !== album.id && entry.title === album.title);
  const owner = albumOwnerLabel(album);
  if ((duplicateTitle || album.ownerId !== currentUserId) && album.title !== owner) return `${album.title} · ${owner}`;
  return album.title;
}

function mediaUrl(params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const query = search.toString();
  return query ? `/media?${query}` : "/media";
}

export default async function MediaPage({ searchParams }: { searchParams: MediaSearchParams }) {
  const user = await currentUser();
  if (!user) redirect("/login");

  const albumFilter = searchParams.album || "";
  const kindFilter = searchParams.kind === "IMAGE" || searchParams.kind === "VIDEO" ? searchParams.kind : "";
  const visibilityFilter = ["PRIVATE", "PARTNER", "SHARED"].includes(searchParams.visibility || "") ? searchParams.visibility || "" : "";
  const q = searchParams.q?.trim() || "";
  const albumScope = await visibilityScope(user);
  const mediaScope = await mediaVisibilityScope(user);
  const fileScope = await ownerScope(user);
  const defaultAlbum = await ensureDefaultAlbum(user.id);
  const [allMedia, albums, albumMedia] = await Promise.all([
    prisma.media.findMany({
      where: {
        ...mediaScope,
        ...(albumFilter ? { albumId: albumFilter } : {}),
        ...(kindFilter ? { kind: kindFilter as "IMAGE" | "VIDEO" } : {}),
        ...(q ? { title: { contains: q, mode: "insensitive" as const } } : {})
      },
      include: { album: true },
      orderBy: { createdAt: "desc" }
    }),
    prisma.album.findMany({
      where: albumScope,
      include: { owner: { include: { profile: true } } },
      orderBy: [{ title: "asc" }, { createdAt: "asc" }]
    }),
    prisma.media.findMany({
      where: mediaScope,
      include: { album: true },
      orderBy: { createdAt: "desc" },
      take: 120
    })
  ]);
  const media = visibilityFilter ? allMedia.filter((entry) => effectiveVisibility(entry) === visibilityFilter) : allMedia;

  const fileIds = Array.from(new Set([...media, ...albumMedia].map((entry) => fileIdFromUrl(entry.url)).filter((id): id is string => Boolean(id))));
  const fileAssets = fileIds.length ? await prisma.fileAsset.findMany({ where: { ...fileScope, id: { in: fileIds } } }) : [];
  const fileById = new Map(fileAssets.map((asset) => [asset.id, asset]));
  const selected = searchParams.view ? media.find((entry) => entry.id === searchParams.view) : null;
  const selectedAsset = selected ? fileById.get(fileIdFromUrl(selected.url) || "") : null;
  const baseFilters = { album: albumFilter, kind: kindFilter, visibility: visibilityFilter, q };
  const closeUrl = mediaUrl({ ...baseFilters, view: undefined });
  const selectedUrl = selected ? mediaUrl({ ...baseFilters, view: selected.id }) : "/media";
  const selectedAlbumForUi = selected?.albumId ? albums.find((album) => album.id === selected.albumId) : null;
  const selectedComments = selected
    ? await prisma.mediaComment.findMany({
        where: { mediaId: selected.id },
        include: { owner: { select: { name: true, username: true, email: true } } },
        orderBy: { createdAt: "desc" },
        take: 20
      })
    : [];

  return (
    <AppShell>
      <PageHeader title="Medien" />
      <PageGuide title="Bilder und Videos als geschuetzter, bildzentrierter Feed">
        Die Medienseite zeigt Bilder und Videos zuerst als kompakten Feed. Upload, Alben und Filter liegen oben als aufklappbare Werkzeuge; Details, Dateiinfos und Aktionen erscheinen beim Öffnen eines Mediums.
      </PageGuide>

      <div className="space-y-4">
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          <Link href={mediaUrl({ ...baseFilters, album: undefined, view: undefined })} className={`focus-ring shrink-0 rounded-full border px-3 py-1.5 text-sm font-semibold ${!albumFilter ? "border-redbrand bg-redbrand text-white" : "border-line bg-surface text-ink hover:bg-paper"}`}>
            Alle
          </Link>
          {albums.map((album) => (
            <Link key={album.id} href={mediaUrl({ ...baseFilters, album: album.id, view: undefined })} className={`focus-ring shrink-0 rounded-full border px-3 py-1.5 text-sm font-semibold ${albumFilter === album.id ? "border-redbrand bg-redbrand text-white" : "border-line bg-surface text-ink hover:bg-paper"}`}>
              {albumLabel(album, user.id, albums)}
            </Link>
          ))}
        </div>

        {media.length ? (
          <div className="grid grid-cols-3 gap-1 sm:gap-2 xl:grid-cols-4 2xl:grid-cols-5">
            {media.map((entry) => {
              const fileId = fileIdFromUrl(entry.url);
              const asset = fileId ? fileById.get(fileId) : null;
              return (
                <Link
                  key={entry.id}
                  href={mediaUrl({ ...baseFilters, view: entry.id })}
                  scroll={false}
                  className="group focus-ring relative block aspect-square overflow-hidden bg-paper"
                >
                  {entry.kind === "IMAGE" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={entry.url} alt={entry.title} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.04]" />
                  ) : (
                    <video src={entry.url} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.04]" muted playsInline />
                  )}
                  {entry.kind === "VIDEO" ? <Film className="absolute right-2 top-2 h-5 w-5 text-white drop-shadow" /> : null}
                  <span className="absolute inset-x-0 bottom-0 translate-y-3 bg-gradient-to-t from-black/80 via-black/35 to-transparent p-3 opacity-0 transition group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
                    <span className="block truncate text-sm font-semibold text-white">{entry.title}</span>
                    <span className="mt-1 flex items-center gap-2 text-xs text-white/85">
                      <Eye className="h-3.5 w-3.5" />
                      {mediaTypeLabel(entry.kind)} · {visibilityModeLabel(entry)}
                    </span>
                    <span className="mt-1 block truncate text-xs text-white/75">{asset?.originalName || entry.album?.title || defaultAlbum.title}</span>
                  </span>
                </Link>
              );
            })}
          </div>
        ) : (
          <EmptyState title="Noch keine Medien gefunden">
            Lade ein Bild oder Video hoch, oder sende ein Bild über Telegram, um die Galerie zu füllen.
          </EmptyState>
        )}

        <div className="grid gap-3 pt-4 lg:grid-cols-3">
          <details className="rounded-lg border border-line bg-surface shadow-soft">
            <summary className="focus-ring flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-semibold text-ink hover:bg-paper [&::-webkit-details-marker]:hidden">
              <span className="inline-flex items-center gap-2"><Upload className="h-4 w-4 text-redbrand" /> Upload</span>
              <Plus className="h-4 w-4 text-graphite" />
            </summary>
            <form action={createMedia} className="space-y-3 border-t border-line p-4">
              <Field label="Titel"><input className={inputClass} name="title" required /></Field>
              <FileUploadField name="file" label="Datei" accept="image/*,video/*" required help="Bild oder Video auswählen." />
              <Field label="Album">
                <select className={selectClass} name="albumId" defaultValue={defaultAlbum.id}>
                  {albums.map((album) => <option key={album.id} value={album.id}>{albumLabel(album, user.id, albums)}</option>)}
                </select>
              </Field>
              <Field label="Sichtbarkeit">
                <select className={selectClass} name="visibility" defaultValue="INHERIT">
                  <option value="INHERIT">Wie Album</option>
                  <option value="PRIVATE">Nur ich</option>
                  <option value="PARTNER">Zirkel</option>
                  <option value="SHARED">Alle</option>
                </select>
              </Field>
              <Button><Save className="h-4 w-4" /> Speichern</Button>
            </form>
          </details>

          <details className="rounded-lg border border-line bg-surface shadow-soft">
            <summary className="focus-ring flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-semibold text-ink hover:bg-paper [&::-webkit-details-marker]:hidden">
              <span className="inline-flex items-center gap-2"><Folder className="h-4 w-4 text-redbrand" /> Album</span>
              <Plus className="h-4 w-4 text-graphite" />
            </summary>
            <div className="border-t border-line">
              <details className="border-b border-line">
                <summary className="focus-ring flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-ink hover:bg-paper [&::-webkit-details-marker]:hidden">
                  Neues Album
                  <Plus className="h-4 w-4 text-graphite" />
                </summary>
                <form action={createAlbum} className="space-y-3 border-t border-line p-4">
                  <Field label="Titel"><input className={inputClass} name="title" required /></Field>
                  <Field label="Beschreibung"><textarea className={inputClass} name="description" rows={3} /></Field>
                  <Field label="Sichtbarkeit">
                    <select className={selectClass} name="visibility">
                      <option value="PRIVATE">Nur ich</option>
                      <option value="PARTNER">Zirkel</option>
                      <option value="SHARED">Alle</option>
                    </select>
                  </Field>
                  <SubmitButton pendingLabel="Album wird gespeichert...">Album speichern</SubmitButton>
                </form>
              </details>
            </div>
            {albums.length && albumMedia.length ? (
              <details className="border-b border-line">
                <summary className="focus-ring flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-ink hover:bg-paper [&::-webkit-details-marker]:hidden">
                  Medien verschieben
                  <Plus className="h-4 w-4 text-graphite" />
                </summary>
                <form action={addMediaToAlbum} className="space-y-3 border-t border-line p-4">
                  <Field label="Zielalbum">
                    <select className={selectClass} name="albumId" required>
                      <option value="">Album wählen</option>
                      {albums.map((album) => <option key={album.id} value={album.id}>{albumLabel(album, user.id, albums)}</option>)}
                    </select>
                  </Field>
                  <div className="max-h-72 overflow-y-auto rounded-lg border border-line bg-paper p-2">
                    <div className="grid grid-cols-3 gap-2">
                      {albumMedia.map((entry) => (
                        <label key={entry.id} className="group relative aspect-square cursor-pointer overflow-hidden rounded-md bg-surface">
                          <input name="mediaIds" type="checkbox" value={entry.id} className="peer absolute left-2 top-2 z-10 h-4 w-4 accent-redbrand" />
                          {entry.kind === "IMAGE" ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={entry.url} alt={entry.title} className="h-full w-full object-cover transition group-hover:scale-[1.04]" />
                          ) : (
                            <video src={entry.url} className="h-full w-full object-cover transition group-hover:scale-[1.04]" muted playsInline />
                          )}
                          <span className="absolute inset-0 border-2 border-transparent peer-checked:border-redbrand" />
                          <span className="absolute inset-x-0 bottom-0 truncate bg-black/65 px-2 py-1 text-[11px] font-semibold text-white">{entry.title}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <Button variant="secondary" className="w-full">Auswahl ins Zielalbum verschieben</Button>
                </form>
              </details>
            ) : null}
            <details>
              <summary className="focus-ring flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-ink hover:bg-paper [&::-webkit-details-marker]:hidden">
                Alben verwalten
                <Plus className="h-4 w-4 text-graphite" />
              </summary>
              <div className="space-y-3 border-t border-line p-4">
                {albums.map((album) => {
                  const count = albumMedia.filter((entry) => entry.albumId === album.id).length;
                  const isDefault = album.id === defaultAlbum.id;
                  return (
                    <details key={album.id} className="rounded-md border border-line bg-paper p-3">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
                        <span className="min-w-0">
                          <strong className="block truncate">{albumLabel(album, user.id, albums)}</strong>
                          <span className="text-xs text-graphite">{count} Medien · {visibilityLabel(album.visibility)}</span>
                        </span>
                        <Badge tone={isDefault ? "red" : "neutral"}>{isDefault ? "Hauptalbum" : "Album"}</Badge>
                      </summary>
                      <form action={updateAlbum} className="mt-3 space-y-3 border-t border-line pt-3">
                        <input type="hidden" name="albumId" value={album.id} />
                        <Field label="Albumname"><input className={inputClass} name="title" defaultValue={album.title} required /></Field>
                        <Field label="Beschreibung"><textarea className={inputClass} name="description" rows={2} defaultValue={album.description || ""} /></Field>
                        <Field label="Sichtbarkeit">
                          <select className={selectClass} name="visibility" defaultValue={album.visibility}>
                            <option value="PRIVATE">Nur ich</option>
                            <option value="PARTNER">Zirkel</option>
                            <option value="SHARED">Alle</option>
                          </select>
                        </Field>
                        <SubmitButton pendingLabel="Album wird gespeichert..." className="w-full">Album aktualisieren</SubmitButton>
                      </form>
                      {isDefault ? (
                        <p className="mt-3 rounded-md bg-surface p-3 text-sm text-graphite">Das persönliche Hauptalbum kann nicht gelöscht werden.</p>
                      ) : (
                        <form action={deleteAlbum} className="mt-3 space-y-3 border-t border-line pt-3">
                          <input type="hidden" name="albumId" value={album.id} />
                          <p className="text-sm text-graphite">Beim Löschen werden die Medien standardmäßig nach <strong>{defaultAlbum.title}</strong> verschoben.</p>
                          <label className="flex items-start gap-2 rounded-md border border-redbrand/30 bg-redbrand/5 p-3 text-sm text-redbrand">
                            <input name="deleteMedia" type="checkbox" className="mt-1 h-4 w-4 accent-redbrand" />
                            Medien und Dateien endgültig mitlöschen
                          </label>
                          <Button variant="danger" className="w-full"><Trash2 className="h-4 w-4" /> Album löschen</Button>
                        </form>
                      )}
                    </details>
                  );
                })}
              </div>
            </details>
          </details>

          <details className="rounded-lg border border-line bg-surface shadow-soft">
            <summary className="focus-ring flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-semibold text-ink hover:bg-paper [&::-webkit-details-marker]:hidden">
              <span className="inline-flex items-center gap-2"><Search className="h-4 w-4 text-redbrand" /> Filter</span>
              <Plus className="h-4 w-4 text-graphite" />
            </summary>
            <form className="space-y-3 border-t border-line p-4">
              <Field label="Suche"><input className={inputClass} name="q" defaultValue={q} placeholder="Titel suchen" /></Field>
              <Field label="Typ">
                <select className={selectClass} name="kind" defaultValue={kindFilter}>
                  <option value="">Alles</option>
                  <option value="IMAGE">Bilder</option>
                  <option value="VIDEO">Videos</option>
                </select>
              </Field>
              <Field label="Sichtbarkeit">
                <select className={selectClass} name="visibility" defaultValue={visibilityFilter}>
                  <option value="">Alle</option>
                  <option value="PRIVATE">Nur ich</option>
                  <option value="PARTNER">Zirkel</option>
                  <option value="SHARED">Alle</option>
                </select>
              </Field>
              <div className="flex gap-2">
                <Button>Filtern</Button>
                <Link href="/media" className="focus-ring inline-flex min-h-10 items-center rounded-md border border-line bg-surface px-4 py-2 text-sm font-semibold hover:bg-paper">Reset</Link>
              </div>
            </form>
          </details>
        </div>
      </div>

      {selected ? (
        <div className="fixed inset-0 z-50 bg-black/80 px-3 py-5 backdrop-blur-sm sm:px-6">
          <div className="mx-auto flex h-full max-w-6xl flex-col overflow-hidden rounded-lg bg-surface shadow-soft lg:grid lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="relative min-h-0 bg-black">
              <Link href={closeUrl} scroll={false} className="focus-ring absolute right-3 top-3 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black">
                <X className="h-5 w-5" />
              </Link>
              {selected.kind === "IMAGE" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={selected.url} alt={selected.title} className="h-full max-h-[70vh] w-full object-contain lg:max-h-none" />
              ) : (
                <video src={selected.url} className="h-full max-h-[70vh] w-full object-contain lg:max-h-none" controls autoPlay />
              )}
            </div>
            <aside className="flex min-h-0 flex-col overflow-y-auto border-t border-line lg:border-l lg:border-t-0">
              <div className="space-y-3 border-b border-line p-4">
                <div className="flex flex-wrap gap-2">
                  <Badge tone="red">{mediaTypeLabel(selected.kind)}</Badge>
                  <Badge>{visibilityModeLabel(selected)}</Badge>
                  <Badge>{selectedAlbumForUi ? albumLabel(selectedAlbumForUi, user.id, albums) : defaultAlbum.title}</Badge>
                </div>
                <h2 className="text-xl font-semibold text-ink">{selected.title}</h2>
              </div>
              <div className="grid gap-3 p-4 text-sm text-graphite">
                <div className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-redbrand" /> {formatDateTime(selected.createdAt)}</div>
                <div className="flex items-center gap-2"><FileLock2 className="h-4 w-4 text-redbrand" /> {selectedAsset?.originalName || "geschuetzte Datei"}</div>
                <div className="flex items-center gap-2"><ImageIcon className="h-4 w-4 text-redbrand" /> {selectedAsset?.mimeType || selected.kind.toLowerCase()}</div>
                <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-redbrand" /> {formatBytes(selectedAsset?.sizeBytes)}</div>
              </div>
              <form action={updateMediaSettings} className="space-y-3 border-t border-line p-4">
                <input type="hidden" name="mediaId" value={selected.id} />
                <input type="hidden" name="next" value={selectedUrl} />
                <Field label="Album">
                  <select className={selectClass} name="albumId" defaultValue={selected.albumId || defaultAlbum.id}>
                    {albums.map((album) => <option key={album.id} value={album.id}>{albumLabel(album, user.id, albums)}</option>)}
                  </select>
                </Field>
                <Field label="Sichtbarkeit">
                  <select className={selectClass} name="visibility" defaultValue={selected.visibility || "INHERIT"}>
                    <option value="INHERIT">Wie Album ({visibilityLabel(selected.album?.visibility || "PRIVATE")})</option>
                    <option value="PRIVATE">Nur ich</option>
                    <option value="PARTNER">Zirkel</option>
                    <option value="SHARED">Alle</option>
                  </select>
                </Field>
                <SubmitButton pendingLabel="Medium wird gespeichert..." className="w-full">Album und Sichtbarkeit speichern</SubmitButton>
              </form>
              <QuickAlbumForm action={createAlbumForMedia} mediaId={selected.id} />
              <div className="border-t border-line p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
                  <MessageCircle className="h-4 w-4 text-redbrand" />
                  Kommentare
                </div>
                <form action={createMediaComment} className="space-y-3">
                  <input type="hidden" name="mediaId" value={selected.id} />
                  <input type="hidden" name="next" value={selectedUrl} />
                  <textarea className={inputClass} name="body" rows={3} placeholder="Notiz oder Kommentar" required />
                  <Button variant="secondary" className="w-full">Kommentar speichern</Button>
                </form>
                {selectedComments.length ? (
                  <div className="mt-4 space-y-3">
                    {selectedComments.map((comment) => (
                      <div key={comment.id} className="rounded-lg bg-paper p-3">
                        <div className="flex items-center justify-between gap-3 text-xs text-graphite">
                          <span className="truncate font-semibold text-ink">{comment.owner.name || comment.owner.username || comment.owner.email}</span>
                          <span className="shrink-0">{formatDateTime(comment.createdAt)}</span>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-graphite">{comment.body}</p>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="mt-auto flex flex-wrap gap-2 border-t border-line p-4">
                <a href={selected.url} target="_blank" className="focus-ring inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-md border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink hover:bg-paper" rel="noreferrer">
                  <Download className="h-4 w-4" />
                  Öffnen
                </a>
                <form action={deleteMedia} className="flex-1">
                  <input type="hidden" name="id" value={selected.id} />
                  <Button variant="danger" className="w-full">
                    <Trash2 className="h-4 w-4" />
                    Löschen
                  </Button>
                </form>
              </div>
            </aside>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
