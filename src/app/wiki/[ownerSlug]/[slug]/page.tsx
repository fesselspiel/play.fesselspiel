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
      revisions: { include: { actor: { include: { profile: true } } }, orderBy: { createdAt: "desc" }, take: 20 }
    }
  });
  if (!page) notFound();
  const canEdit = page.ownerId === user.id || user.role === "ADMIN" || user.role === "SUPER_ADMIN";
  const ownerSlug = wikiOwnerSlug(page.owner);
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
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <article className="rounded-lg border border-line bg-surface p-5">
          {page.summary ? <p className="mb-5 rounded-md bg-paper p-3 text-sm leading-6 text-graphite">{page.summary}</p> : null}
          <div className="space-y-3" dangerouslySetInnerHTML={{ __html: renderWikiHtml(page.content || "_Noch kein Inhalt._", ownerSlug) }} />
        </article>
        <aside className="space-y-4">
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
            {page.revisions.length ? (
              <div className="space-y-2">
                {page.revisions.map((revision) => (
                  <div key={revision.id} className="rounded-md bg-paper p-3">
                    <div className="font-medium text-ink">
                      {revision.action === "created" || revision.action === "created_api"
                        ? "Angelegt"
                        : revision.action === "imported"
                          ? "Importiert"
                          : "Geändert"}
                    </div>
                    <div className="mt-1 text-xs leading-5 text-graphite">
                      {revision.actor ? userDisplayName(revision.actor) : "System"} · {revision.createdAt.toLocaleDateString("de-DE")}, {revision.createdAt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                ))}
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
