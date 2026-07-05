import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Download, FileUp, Pencil, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, Field, inputClass, PageGuide, PageHeader } from "@/components/ui";
import { userDisplayName } from "@/lib/audit";
import { currentUser } from "@/lib/auth";
import { requireFeature } from "@/lib/features";
import { prisma } from "@/lib/prisma";
import { renderWikiHtml, wikiOwnerBySlug, wikiOwnerSlug, wikiPageAccessWhere } from "@/lib/wiki";
import { deleteWikiPage, importWikiPage } from "../../actions";

type WikiRevisionView = {
  id: string;
  action: string;
  createdAt: Date;
  title: string;
  slug: string;
  summary?: string | null;
  content: string;
  actor?: { profile?: { displayName?: string | null } | null; name?: string | null; username?: string | null; email?: string | null } | null;
};

function revisionActionLabel(action: string) {
  if (action === "created" || action === "created_api") return "Angelegt";
  if (action === "imported") return "Importiert";
  return "Geändert";
}

function changedFields(current: WikiRevisionView, previous?: WikiRevisionView | null) {
  const fields = [
    ["Titel", previous?.title || "", current.title || ""],
    ["Adresse", previous?.slug || "", current.slug || ""],
    ["Kurznotiz", previous?.summary || "", current.summary || ""]
  ] as const;
  return fields.filter(([, before, after]) => before !== after);
}

function lineDiff(before: string, after: string) {
  const beforeLines = before.replace(/\r\n/g, "\n").split("\n");
  const afterLines = after.replace(/\r\n/g, "\n").split("\n");
  const rows: { type: "same" | "added" | "removed"; text: string }[] = [];
  let i = 0;
  let j = 0;
  while (i < beforeLines.length || j < afterLines.length) {
    if (beforeLines[i] === afterLines[j]) {
      rows.push({ type: "same", text: beforeLines[i] || "" });
      i += 1;
      j += 1;
      continue;
    }
    const nextBefore = beforeLines.slice(i + 1, i + 6).findIndex((line) => line === afterLines[j]);
    const nextAfter = afterLines.slice(j + 1, j + 6).findIndex((line) => line === beforeLines[i]);
    if (j < afterLines.length && (i >= beforeLines.length || (nextAfter >= 0 && (nextBefore < 0 || nextAfter <= nextBefore)))) {
      rows.push({ type: "added", text: afterLines[j] || "" });
      j += 1;
      continue;
    }
    if (i < beforeLines.length) {
      rows.push({ type: "removed", text: beforeLines[i] || "" });
      i += 1;
      continue;
    }
    rows.push({ type: "added", text: afterLines[j] || "" });
    j += 1;
  }
  return rows.filter((row) => row.type !== "same" || row.text.trim()).slice(0, 220);
}

export default async function WikiDetailPage({ params }: { params: { ownerSlug: string; slug: string } }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  await requireFeature("wiki");
  const owner = await wikiOwnerBySlug(params.ownerSlug, user);
  if (!owner) notFound();
  const page = await prisma.wikiPage.findFirst({
    where: { AND: [await wikiPageAccessWhere(user), { ownerId: owner.id, slug: params.slug }] },
    include: {
      owner: { include: { profile: true } },
      shares: { include: { targetUser: { include: { profile: true } }, targetCircle: true } },
      revisions: { include: { actor: { include: { profile: true } } }, orderBy: { createdAt: "desc" }, take: 20 },
      images: { include: { file: true }, orderBy: { createdAt: "asc" } }
    }
  });
  if (!page) notFound();
  const canEdit = page.ownerId === user.id || user.role === "ADMIN" || user.role === "SUPER_ADMIN";
  const ownerSlug = wikiOwnerSlug(page.owner);
  const revisions: WikiRevisionView[] = page.revisions.length
    ? page.revisions.map((revision) => ({
        id: revision.id,
        action: revision.action,
        createdAt: revision.createdAt,
        title: revision.title,
        slug: revision.slug,
        summary: revision.summary,
        content: revision.content,
        actor: revision.actor
      }))
    : [{
        id: "created-fallback",
        action: "created",
        createdAt: page.createdAt,
        title: page.title,
        slug: page.slug,
        summary: page.summary,
        content: page.content,
        actor: page.owner
      }];
  return (
    <AppShell>
      <PageHeader
        title={page.title}
        subtitle={`/wiki/${ownerSlug}/${page.slug}`}
        action={
          <div className="flex flex-wrap gap-2">
            <a href={`/wiki/${ownerSlug}/${page.slug}/export`} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink hover:bg-paper">
              <Download className="h-4 w-4" />
              Export
            </a>
            {canEdit ? (
              <Link href={`/wiki/${ownerSlug}/${page.slug}/edit`} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-redbrand px-4 py-2 text-sm font-semibold text-white">
                <Pencil className="h-4 w-4" />
                Bearbeiten
              </Link>
            ) : null}
          </div>
        }
      />
      <div className="space-y-5">
        <article className="rounded-lg border border-line bg-surface p-5">
          <div className="space-y-3 [&>*:first-child]:mt-0" dangerouslySetInnerHTML={{ __html: renderWikiHtml(page.content || "_Noch kein Inhalt._", ownerSlug) }} />
          {page.images.length ? (
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {page.images.map((image) => (
                <figure key={image.id} className="overflow-hidden rounded-lg border border-line bg-paper">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/files/${image.fileId}`} alt={image.title || page.title} className="w-full object-contain" />
                  {image.title ? <figcaption className="px-3 py-2 text-xs text-graphite">{image.title}</figcaption> : null}
                </figure>
              ))}
            </div>
          ) : null}
        </article>
        <aside className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-lg border border-line bg-surface p-4 text-sm text-graphite">
            <h2 className="mb-2 font-semibold text-ink">Freigabe</h2>
            <p>{page.visibility === "SHARED" ? "Alle sichtbaren Benutzer" : page.visibility === "PARTNER" ? "Zirkel" : "Privat"}</p>
            {page.shares.length ? (
              <ul className="mt-3 space-y-1">
                {page.shares.map((share) => (
                  <li key={share.id}>Zusätzlich: {share.targetCircle?.name || (share.targetUser ? userDisplayName(share.targetUser) : "Unbekannt")}</li>
                ))}
              </ul>
            ) : null}
            <p className="mt-3 text-xs">Besitzer: {userDisplayName(page.owner)}</p>
          </section>
          {canEdit ? (
            <section className="rounded-lg border border-line bg-surface p-4">
              <details>
                <summary className="cursor-pointer list-none text-sm font-semibold text-ink hover:text-redbrand [&::-webkit-details-marker]:hidden">
                  MediaWiki importieren
                </summary>
                <form action={importWikiPage} className="mt-3 space-y-3">
                  <input type="hidden" name="id" value={page.id} />
                  <Field label=".wiki-Datei">
                    <input className={inputClass} name="wikiFile" type="file" accept=".wiki,.txt,text/plain" />
                  </Field>
                  <Field label="Oder Text einfügen">
                    <textarea className={`${inputClass} font-mono`} name="wikiText" rows={6} />
                  </Field>
                  <Button variant="secondary">
                    <FileUp className="h-4 w-4" />
                    Importieren
                  </Button>
                </form>
              </details>
            </section>
          ) : null}
          <section className="rounded-lg border border-line bg-surface p-4 text-sm">
            <h2 className="mb-3 font-semibold text-ink">Änderungsprotokoll</h2>
            {revisions.length ? (
              <div className="space-y-2">
                {revisions.map((revision, index) => {
                  const previous = revisions[index + 1] || null;
                  const fields = changedFields(revision, previous);
                  const diff = lineDiff(previous?.content || "", revision.content || "");
                  const changedLineCount = diff.filter((row) => row.type !== "same").length;
                  return (
                    <details key={revision.id} className="rounded-md border border-line bg-paper">
                      <summary className="flex cursor-pointer list-none flex-col gap-1 px-3 py-3 hover:bg-surface [&::-webkit-details-marker]:hidden">
                        <span className="font-medium text-ink">{revisionActionLabel(revision.action)}</span>
                        <span className="text-xs leading-5 text-graphite">
                          {revision.actor ? userDisplayName(revision.actor) : "System"} · {revision.createdAt.toLocaleDateString("de-DE")}, {revision.createdAt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} · {fields.length || changedLineCount ? `${fields.length + changedLineCount} Änderung${fields.length + changedLineCount === 1 ? "" : "en"}` : "keine Textänderung"}
                        </span>
                      </summary>
                      <div className="border-t border-line bg-surface p-3">
                        {fields.length ? (
                          <div className="mb-3 overflow-hidden rounded-md border border-line">
                            <div className="grid grid-cols-[7rem_1fr_1fr] bg-paper px-3 py-2 text-xs font-semibold text-graphite">
                              <span>Feld</span>
                              <span>Vorher</span>
                              <span>Nachher</span>
                            </div>
                            {fields.map(([label, before, after]) => (
                              <div key={label} className="grid grid-cols-[7rem_1fr_1fr] border-t border-line px-3 py-2 text-xs">
                                <span className="font-semibold text-ink">{label}</span>
                                <span className="break-words text-redbrand">{before || "leer"}</span>
                                <span className="break-words text-emerald-700">{after || "leer"}</span>
                              </div>
                            ))}
                          </div>
                        ) : null}
                        {diff.length ? (
                          <div className="overflow-hidden rounded-md border border-line font-mono text-xs">
                            <div className="bg-paper px-3 py-2 font-sans font-semibold text-graphite">Inhaltsvergleich</div>
                            {diff.map((row, rowIndex) => (
                              <div
                                key={`${row.type}-${rowIndex}`}
                                className={`grid grid-cols-[2rem_1fr] border-t border-line px-3 py-1.5 ${
                                  row.type === "added"
                                    ? "bg-emerald-500/10 text-emerald-800"
                                    : row.type === "removed"
                                      ? "bg-redbrand/10 text-redbrand"
                                      : "bg-surface text-graphite"
                                }`}
                              >
                                <span>{row.type === "added" ? "+" : row.type === "removed" ? "-" : " "}</span>
                                <span className="whitespace-pre-wrap break-words">{row.text || " "}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-graphite">Für diese Revision gibt es keine Inhaltsänderung gegenüber der vorherigen Version.</p>
                        )}
                      </div>
                    </details>
                  );
                })}
              </div>
            ) : (
              <p className="text-graphite">Noch keine protokollierten Änderungen vorhanden.</p>
            )}
          </section>
          {canEdit ? (
            <form action={deleteWikiPage} className="rounded-lg border border-line bg-surface p-4">
              <input type="hidden" name="id" value={page.id} />
              <Button variant="danger" className="w-full">
                <Trash2 className="h-4 w-4" />
                Wiki-Seite löschen
              </Button>
            </form>
          ) : null}
        </aside>
      </div>
      <PageGuide title="Wiki-Seite lesen und austauschen">
        Der Inhalt wird aus MediaWiki-Text gerendert. Über Export bekommst du eine .wiki-Datei, über Import kannst du MediaWiki-Text wieder einlesen. Freigaben steuerst du im Bearbeiten-Dialog.
      </PageGuide>
    </AppShell>
  );
}
