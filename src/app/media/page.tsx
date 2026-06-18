import { redirect } from "next/navigation";
import Link from "next/link";
import { CalendarDays, FileLock2, Film, Folder, HardDrive, Image as ImageIcon, Images, Save, ShieldCheck, Trash2, Upload } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { FileUploadField } from "@/components/file-upload-field";
import { Badge, Button, EmptyState, Field, inputClass, PageGuide, PageHeader, Panel, selectClass, SoftPanel } from "@/components/ui";
import { ownerScope } from "@/lib/access";
import { currentUser } from "@/lib/auth";
import { deleteOwnedFile, fileAssetUrl, fileIdFromUrl, saveUploadedFile } from "@/lib/files";
import { formatDateTime } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

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

function filterUrl(params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const query = search.toString();
  return query ? `/media?${query}` : "/media";
}

export default async function MediaPage({ searchParams }: { searchParams: { album?: string; kind?: string; visibility?: string; q?: string } }) {
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
  const latest = media[0];
  const totalBytes = fileAssets.reduce((sum, asset) => sum + asset.sizeBytes, 0);
  const imageCount = media.filter((entry) => entry.kind === "IMAGE").length;
  const videoCount = media.filter((entry) => entry.kind === "VIDEO").length;
  const grouped = new Map<string, typeof media>();
  for (const entry of media) {
    const key = entry.album?.title || "Ohne Album";
    grouped.set(key, [...(grouped.get(key) || []), entry]);
  }

  return (
    <AppShell>
      <PageHeader title="Medien" subtitle="Geschuetzte Galerie fuer Bilder, Videos, Alben und private Dokumentation." />
      <PageGuide>
        In der Mediengalerie sammelst du Bilder und Videos mit Metadaten, Alben und Sichtbarkeit. Lade links neue Dateien hoch, lege Alben an, filtere die Galerie und entferne Medien inklusive Serverdatei ueber Loeschen.
      </PageGuide>
      <div className="grid gap-6 xl:grid-cols-[390px_1fr]">
        <div className="space-y-6">
          <Panel>
            <div className="mb-4 flex items-center gap-2">
              <Upload className="h-5 w-5 text-redbrand" />
              <h2 className="text-lg font-semibold">Upload</h2>
            </div>
            <form action={createMedia} className="space-y-4">
              <Field label="Titel"><input className={inputClass} name="title" required /></Field>
              <FileUploadField name="file" label="Datei" accept="image/*,video/*" required help="Waehle ein Bild oder Video aus." />
              <Field label="Album"><select className={selectClass} name="albumId"><option value="">Kein Album</option>{albums.map((album) => <option key={album.id} value={album.id}>{album.title}</option>)}</select></Field>
              <Field label="Sichtbarkeit"><select className={selectClass} name="visibility"><option value="PRIVATE">privat</option><option value="PARTNER">Partner</option><option value="SHARED">geteilt</option></select></Field>
              <Button><Save className="h-4 w-4" /> Speichern</Button>
            </form>
          </Panel>
          <Panel>
            <div className="mb-4 flex items-center gap-2">
              <Folder className="h-5 w-5 text-redbrand" />
              <h2 className="text-lg font-semibold">Album anlegen</h2>
            </div>
            <form action={createAlbum} className="space-y-4">
              <Field label="Titel"><input className={inputClass} name="title" required /></Field>
              <Field label="Beschreibung"><textarea className={inputClass} name="description" rows={3} /></Field>
              <Field label="Sichtbarkeit"><select className={selectClass} name="visibility"><option value="PRIVATE">privat</option><option value="PARTNER">Partner</option><option value="SHARED">geteilt</option></select></Field>
              <Button>Album speichern</Button>
            </form>
          </Panel>
          <Panel>
            <h2 className="mb-4 text-lg font-semibold">Filter</h2>
            <form className="space-y-3">
              <Field label="Suche"><input className={inputClass} name="q" defaultValue={q} placeholder="Titel suchen" /></Field>
              <Field label="Album">
                <select className={selectClass} name="album" defaultValue={albumFilter}>
                  <option value="">Alle Alben</option>
                  <option value="none">Ohne Album</option>
                  {albums.map((album) => <option key={album.id} value={album.id}>{album.title}</option>)}
                </select>
              </Field>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
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
              </div>
              <div className="flex gap-2">
                <Button>Filtern</Button>
                <Link href="/media" className="focus-ring inline-flex min-h-10 items-center rounded-md border border-line bg-surface px-4 py-2 text-sm font-semibold hover:bg-paper">Zuruecksetzen</Link>
              </div>
            </form>
          </Panel>
        </div>
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-4">
            <SoftPanel className="flex items-center gap-3">
              <Images className="h-5 w-5 text-redbrand" />
              <div><div className="text-xl font-semibold">{media.length}</div><div className="text-xs text-graphite">Medien</div></div>
            </SoftPanel>
            <SoftPanel className="flex items-center gap-3">
              <ImageIcon className="h-5 w-5 text-redbrand" />
              <div><div className="text-xl font-semibold">{imageCount}</div><div className="text-xs text-graphite">Bilder</div></div>
            </SoftPanel>
            <SoftPanel className="flex items-center gap-3">
              <Film className="h-5 w-5 text-redbrand" />
              <div><div className="text-xl font-semibold">{videoCount}</div><div className="text-xs text-graphite">Videos</div></div>
            </SoftPanel>
            <SoftPanel className="flex items-center gap-3">
              <HardDrive className="h-5 w-5 text-redbrand" />
              <div><div className="text-xl font-semibold">{formatBytes(totalBytes)}</div><div className="text-xs text-graphite">geschuetzt</div></div>
            </SoftPanel>
          </div>

          {latest ? (
            <Panel className="overflow-hidden p-0">
              <div className="grid lg:grid-cols-[1.25fr_0.75fr]">
                <a href={latest.url} target="_blank" className="block aspect-[16/10] overflow-hidden bg-paper lg:aspect-auto" rel="noreferrer">
                  {latest.kind === "IMAGE" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={latest.url} alt="" className="h-full min-h-[320px] w-full object-cover" />
                  ) : (
                    <video src={latest.url} className="h-full min-h-[320px] w-full object-cover" controls />
                  )}
                </a>
                <div className="flex flex-col justify-between p-5">
                  <div>
                    <div className="mb-3 flex flex-wrap gap-2">
                      <Badge tone="red">Spotlight</Badge>
                      <Badge>{mediaTypeLabel(latest.kind)}</Badge>
                      <Badge>{visibilityLabel(latest.visibility)}</Badge>
                    </div>
                    <h2 className="text-2xl font-semibold text-ink">{latest.title}</h2>
                    <p className="mt-2 text-sm text-graphite">{latest.album?.title || "Ohne Album"}</p>
                  </div>
                  <div className="mt-6 grid gap-3 text-sm text-graphite">
                    <div className="flex items-center gap-2"><CalendarDays className="h-4 w-4" /> {formatDateTime(latest.createdAt)}</div>
                    <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Auslieferung nur nach Login</div>
                    <div className="flex items-center gap-2"><FileLock2 className="h-4 w-4" /> {fileById.get(fileIdFromUrl(latest.url) || "")?.originalName || "geschuetzte Datei"}</div>
                  </div>
                </div>
              </div>
            </Panel>
          ) : null}

          {media.length ? (
            <div className="space-y-8">
              {Array.from(grouped.entries()).map(([group, entries]) => (
                <section key={group}>
                  <div className="mb-3 flex items-center justify-between gap-3 border-b border-line pb-2">
                    <div>
                      <h2 className="text-lg font-semibold text-ink">{group}</h2>
                      <p className="text-sm text-graphite">{entries.length} Eintraege</p>
                    </div>
                    <Link href={filterUrl({ album: entries[0].albumId || "none" })} className="text-sm font-semibold text-redbrand">Album filtern</Link>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
                    {entries.map((entry) => {
                      const fileId = fileIdFromUrl(entry.url);
                      const asset = fileId ? fileById.get(fileId) : null;
                      return (
                        <article key={entry.id} className="group overflow-hidden rounded-lg border border-line bg-surface shadow-soft">
                          <a href={entry.url} target="_blank" className="relative block aspect-[4/3] overflow-hidden bg-paper" rel="noreferrer">
                            {entry.kind === "IMAGE" ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={entry.url} alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" />
                            ) : (
                              <video src={entry.url} className="h-full w-full object-cover" controls />
                            )}
                            <span className="absolute left-3 top-3 rounded-full bg-surface/90 px-2.5 py-1 text-xs font-semibold text-ink shadow-soft">{mediaTypeLabel(entry.kind)}</span>
                          </a>
                          <div className="space-y-4 p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <h3 className="truncate font-semibold text-ink">{entry.title}</h3>
                                <p className="mt-1 text-sm text-graphite">{entry.album?.title || "Ohne Album"}</p>
                              </div>
                              <Badge>{visibilityLabel(entry.visibility)}</Badge>
                            </div>
                            <dl className="grid grid-cols-2 gap-2 text-xs text-graphite">
                              <div className="rounded-md bg-paper p-2"><dt>Datei</dt><dd className="mt-1 truncate font-semibold text-ink">{asset?.originalName || "geschuetzt"}</dd></div>
                              <div className="rounded-md bg-paper p-2"><dt>Groesse</dt><dd className="mt-1 font-semibold text-ink">{formatBytes(asset?.sizeBytes)}</dd></div>
                              <div className="rounded-md bg-paper p-2"><dt>Typ</dt><dd className="mt-1 truncate font-semibold text-ink">{asset?.mimeType || entry.kind.toLowerCase()}</dd></div>
                              <div className="rounded-md bg-paper p-2"><dt>Erfasst</dt><dd className="mt-1 font-semibold text-ink">{formatDateTime(entry.createdAt)}</dd></div>
                            </dl>
                            <div className="flex items-center justify-between gap-3">
                              <a href={entry.url} target="_blank" className="text-sm font-semibold text-redbrand" rel="noreferrer">Gross ansehen</a>
                              <form action={deleteMedia}>
                                <input type="hidden" name="id" value={entry.id} />
                                <Button variant="danger" className="min-h-9 px-3 py-1.5">
                                  <Trash2 className="h-4 w-4" />
                                  Loeschen
                                </Button>
                              </form>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <EmptyState title="Noch keine Medien gefunden">
              Lade ein Bild oder Video hoch, oder sende ein Bild ueber Telegram, um die Galerie zu fuellen.
            </EmptyState>
          )}
        </div>
      </div>
    </AppShell>
  );
}
