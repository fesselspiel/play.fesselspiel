import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge, EmptyState, PageGuide, PageHeader } from "@/components/ui";
import { userDisplayName } from "@/lib/audit";
import { currentUser } from "@/lib/auth";
import { requireFeature } from "@/lib/features";
import { prisma } from "@/lib/prisma";
import { wikiOwnerBySlug, wikiOwnerSlug, wikiPageAccessWhere } from "@/lib/wiki";

export default async function WikiOwnerPage({ params }: { params: { ownerSlug: string } }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  await requireFeature("wiki");
  const owner = await wikiOwnerBySlug(params.ownerSlug, user);
  if (!owner) notFound();
  const pages = await prisma.wikiPage.findMany({
    where: { AND: [await wikiPageAccessWhere(user), { ownerId: owner.id }] },
    orderBy: [{ updatedAt: "desc" }, { title: "asc" }]
  });
  const isOwnWiki = owner.id === user.id;
  return (
    <AppShell>
      <PageHeader
        title={`Wiki von ${userDisplayName(owner)}`}
        subtitle={`/wiki/${wikiOwnerSlug(owner)}`}
        action={isOwnWiki ? (
          <Link href="/wiki/new" className="inline-flex min-h-10 items-center gap-2 rounded-md bg-redbrand px-4 py-2 text-sm font-semibold text-white">
            <Plus className="h-4 w-4" />
            Seite
          </Link>
        ) : null}
      />
      {pages.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {pages.map((page) => (
            <Link key={page.id} href={`/wiki/${wikiOwnerSlug(owner)}/${page.slug}`} className="rounded-lg border border-line bg-surface p-4 transition hover:border-redbrand hover:bg-paper">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-base font-semibold text-ink">{page.title}</h2>
                <Badge>{page.visibility === "SHARED" ? "Alle" : page.visibility === "PARTNER" ? "Zirkel" : "Privat"}</Badge>
              </div>
              {page.summary ? <p className="mt-3 line-clamp-2 text-sm leading-6 text-graphite">{page.summary}</p> : null}
              <p className="mt-3 text-xs text-graphite">/{page.slug}</p>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState title="Keine sichtbaren Wiki-Seiten" />
      )}
      <PageGuide title="Benutzer-Namensraum">
        Dieser Bereich zeigt nur Wiki-Seiten dieses Benutzers, für die du berechtigt bist. Eigene Seiten kannst du unter deinem eigenen Namensraum anlegen.
      </PageGuide>
    </AppShell>
  );
}
