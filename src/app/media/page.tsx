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
import { Badge, Button, EmptyState, Field, inputClass, PageGuide, PageHeader, selectClass } from "@/components/ui";
import { ownerScope } from "@/lib/access";
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

async function createMedia(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  const file = await saveUploadedFile(user.id, formData.get("file") as File | null);
  if (!file) redirect("/media");
  const kind = file.mimeType.startsWith("video/") ? "VIDEO" : "IMAGE";
  await prisma.media.create({
    data: {
      ownerId: user.id,
      albumId: String(formData.get("albumId") || "") || null,
      title: String(formData.get("title") || "").trim(),
      kind,
      url: fileAssetUrl(file.id),
      visibility: String(formData.get("visibility") || "PRIVATE") as "PRIVATE" | "PARTNER" | "SHARED"
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
  await prisma.album.create({
    data: {
      ownerId: user.id,
      title: String(formData.get("title") || "").trim(),
      description: String(formData.get("description") || "").trim(),
      visibility: String(formData.get("visibility") || "PRIVATE") as "PRIVATE" | "PARTNER" | "SHARED"
    }
  });
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
  if (value === "PRIVATE") return "privat";
  if (value === "PARTNER") return "Partner";
  return "geteilt";
}

function mediaTypeLabel(value: string) {
  return value === "VIDEO" ? "Video" : "Bild";
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
  const scope = await ownerScope(user);
  const [media, albums] = await Promise.all([
    prisma.media.findMany({
      where: {
        ...scope,
        ...(albumFilter === "none" ? { albumId: null } : albumFilter ? { albumId: albumFilter } : {}),
        ...(kindFilter ? { kind: kindFilter as "IMAGE" | "VIDEO" } : {}),
        ...(visibilityFilter ? { visibility: visibilityFilter as "PRIVATE" | "PARTNER" | "SHARED" } : {}),
        ...(q ? { title: { contains: q, mode: "insensitive" as const } } : {})
      },
      include: { album: true },
      orderBy: { createdAt: "desc" }
    }),
    prisma.album.findMany({ where: scope, orderBy: { title: "asc" } })
  ]);

  const fileIds = media.map((entry) => fileIdFromUrl(entry.url)).filter((id): id is string => Boolean(id));
  const fileAssets = fileIds.length ? await prisma.fileAsset.findMany({ where: { ...scope, id: { in: fileIds } } }) : [];
  const fileById = new Map(fileAssets.map((asset) => [asset.id, asset]));
  const selected = searchParams.view ? media.find((entry) => entry.id === searchParams.view) : null;
  const selectedAsset = selected ? fileById.get(fileIdFromUrl(selected.url) || "") : null;
  const baseFilters = { album: albumFilter, kind: kindFilter, visibility: visibilityFilter, q };
  const closeUrl = mediaUrl({ ...baseFilters, view: undefined });
  const selectedUrl = selected ? mediaUrl({ ...baseFilters, view: selected.id }) : "/media";
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
      <PageHeader title="Medien" subtitle="Bilder und Videos als geschuetzter, bildzentrierter Feed." />
      <PageGuide>
        Die Medienseite zeigt Bilder und Videos zuerst als kompakten Feed. Upload, Alben und Filter liegen oben als aufklappbare Werkzeuge; Details, Dateiinfos und Aktionen erscheinen beim Oeffnen eines Mediums.
      </PageGuide>

      <div className="space-y-4">
        <div className="grid gap-3 lg:grid-cols-3">
          <details className="rounded-lg border border-line bg-surface shadow-soft">
            <summary className="focus-ring flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-semibold text-ink hover:bg-paper [&::-webkit-details-marker]:hidden">
              <span className="inline-flex items-center gap-2"><Upload className="h-4 w-4 text-redbrand" /> Upload</span>
              <Plus className="h-4 w-4 text-graphite" />
            </summary>
            <form action={createMedia} className="space-y-3 border-t border-line p-4">
              <Field label="Titel"><input className={inputClass} name="title" required /></Field>
              <FileUploadField name="file" label="Datei" accept="image/*,video/*" required help="Bild oder Video auswaehlen." />
              <Field label="Album">
                <select className={selectClass} name="albumId">
                  <option value="">Kein Album</option>
                  {albums.map((album) => <option key={album.id} value={album.id}>{album.title}</option>)}
                </select>
              </Field>
              <Field label="Sichtbarkeit">
                <select className={selectClass} name="visibility">
                  <option value="PRIVATE">privat</option>
                  <option value="PARTNER">Partner</option>
                  <option value="SHARED">geteilt</option>
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
            <form action={createAlbum} className="space-y-3 border-t border-line p-4">
              <Field label="Titel"><input className={inputClass} name="title" required /></Field>
              <Field label="Beschreibung"><textarea className={inputClass} name="description" rows={3} /></Field>
              <Field label="Sichtbarkeit">
                <select className={selectClass} name="visibility">
                  <option value="PRIVATE">privat</option>
                  <option value="PARTNER">Partner</option>
                  <option value="SHARED">geteilt</option>
                </select>
              </Field>
              <Button>Album speichern</Button>
            </form>
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
                  <option value="PRIVATE">privat</option>
                  <option value="PARTNER">Partner</option>
                  <option value="SHARED">geteilt</option>
                </select>
              </Field>
              <div className="flex gap-2">
                <Button>Filtern</Button>
                <Link href="/media" className="focus-ring inline-flex min-h-10 items-center rounded-md border border-line bg-surface px-4 py-2 text-sm font-semibold hover:bg-paper">Reset</Link>
              </div>
            </form>
          </details>
        </div>

        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          <Link href={mediaUrl({ ...baseFilters, album: undefined, view: undefined })} className={`focus-ring shrink-0 rounded-full border px-3 py-1.5 text-sm font-semibold ${!albumFilter ? "border-redbrand bg-redbrand text-white" : "border-line bg-surface text-ink hover:bg-paper"}`}>
            Alle
          </Link>
          <Link href={mediaUrl({ ...baseFilters, album: "none", view: undefined })} className={`focus-ring shrink-0 rounded-full border px-3 py-1.5 text-sm font-semibold ${albumFilter === "none" ? "border-redbrand bg-redbrand text-white" : "border-line bg-surface text-ink hover:bg-paper"}`}>
            Ohne Album
          </Link>
          {albums.map((album) => (
            <Link key={album.id} href={mediaUrl({ ...baseFilters, album: album.id, view: undefined })} className={`focus-ring shrink-0 rounded-full border px-3 py-1.5 text-sm font-semibold ${albumFilter === album.id ? "border-redbrand bg-redbrand text-white" : "border-line bg-surface text-ink hover:bg-paper"}`}>
              {album.title}
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
                      {mediaTypeLabel(entry.kind)} · {visibilityLabel(entry.visibility)}
                    </span>
                    <span className="mt-1 block truncate text-xs text-white/75">{asset?.originalName || entry.album?.title || "Ohne Album"}</span>
                  </span>
                </Link>
              );
            })}
          </div>
        ) : (
          <EmptyState title="Noch keine Medien gefunden">
            Lade ein Bild oder Video hoch, oder sende ein Bild ueber Telegram, um die Galerie zu fuellen.
          </EmptyState>
        )}
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
                  <Badge>{visibilityLabel(selected.visibility)}</Badge>
                  <Badge>{selected.album?.title || "Ohne Album"}</Badge>
                </div>
                <h2 className="text-xl font-semibold text-ink">{selected.title}</h2>
              </div>
              <div className="grid gap-3 p-4 text-sm text-graphite">
                <div className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-redbrand" /> {formatDateTime(selected.createdAt)}</div>
                <div className="flex items-center gap-2"><FileLock2 className="h-4 w-4 text-redbrand" /> {selectedAsset?.originalName || "geschuetzte Datei"}</div>
                <div className="flex items-center gap-2"><ImageIcon className="h-4 w-4 text-redbrand" /> {selectedAsset?.mimeType || selected.kind.toLowerCase()}</div>
                <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-redbrand" /> {formatBytes(selectedAsset?.sizeBytes)}</div>
              </div>
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
                  Oeffnen
                </a>
                <form action={deleteMedia} className="flex-1">
                  <input type="hidden" name="id" value={selected.id} />
                  <Button variant="danger" className="w-full">
                    <Trash2 className="h-4 w-4" />
                    Loeschen
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
