import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge, EmptyState, PageGuide, PageHeader } from "@/components/ui";
import { userDisplayName } from "@/lib/audit";
import { currentUser } from "@/lib/auth";
import { requireFeature } from "@/lib/features";
import { prisma } from "@/lib/prisma";
import { wikiOwnerSlug, wikiPageAccessWhere } from "@/lib/wiki";

function visibilityLabel(value: string) {
  if (value === "SHARED") return "Alle";
  if (value === "PARTNER") return "Zirkel";
  return "Privat";
}

export default async function WikiPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  await requireFeature("wiki");
  const pages = await prisma.wikiPage.findMany({
    where: await wikiPageAccessWhere(user),
    include: { owner: { include: { profile: true } }, shares: true },
    orderBy: [{ updatedAt: "desc" }, { title: "asc" }]
  });
  const ownPages = pages.filter((page) => page.ownerId === user.id);
  const sharedPages = pages.filter((page) => page.ownerId !== user.id);
  const groups = [
    { label: "Mein Wiki", pages: ownPages, open: true },
    { label: "Freigegebene Wikis", pages: sharedPages, open: sharedPages.length > 0 }
  ];

  return (
    <AppShell>
      <PageHeader
        title="Wiki"
        subtitle="Persönliche Notizen und Anleitungen im MediaWiki-kompatiblen Textformat."
        action={
          <Link href="/wiki/new" className="inline-flex min-h-10 items-center gap-2 rounded-md bg-redbrand px-4 py-2 text-sm font-semibold text-white">
            <Plus className="h-4 w-4" />
            Wiki-Seite
          </Link>
        }
      />
      {pages.length ? (
        <div className="space-y-4">
          {groups.map((group) => (
            <details key={group.label} open={group.open} className="overflow-hidden rounded-lg border border-line bg-surface">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 bg-paper px-4 py-3 text-sm font-semibold text-ink hover:text-redbrand [&::-webkit-details-marker]:hidden">
                <span>{group.label}</span>
                <span className="rounded-md bg-surface px-2 py-1 text-xs font-medium text-graphite">{group.pages.length}</span>
              </summary>
              <div className="grid gap-3 p-3 md:grid-cols-2">
                {group.pages.map((page) => (
                  <Link key={page.id} href={`/wiki/${wikiOwnerSlug(page.owner)}/${page.slug}`} className="rounded-lg border border-line bg-paper p-4 transition hover:border-redbrand hover:bg-surface">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="truncate text-base font-semibold text-ink">{page.title}</h2>
                        <p className="mt-1 text-xs text-graphite">/{wikiOwnerSlug(page.owner)}/{page.slug}</p>
                      </div>
                      <Badge>{visibilityLabel(page.visibility)}</Badge>
                    </div>
                    <p className="mt-3 text-xs text-graphite">Von {userDisplayName(page.owner)} · {page.updatedAt.toLocaleDateString("de-DE")}</p>
                  </Link>
                ))}
                {!group.pages.length ? <p className="p-4 text-sm text-graphite">Keine Seiten in diesem Bereich.</p> : null}
              </div>
            </details>
          ))}
        </div>
      ) : (
        <EmptyState title="Noch keine Wiki-Seiten">
          <Link href="/wiki/new" className="font-semibold text-redbrand">Erste Wiki-Seite anlegen</Link>
        </EmptyState>
      )}
      <PageGuide title="Wiki mit Freigaben und MediaWiki-Text">
        Jede Person hat ihren eigenen Namensraum unter /wiki/benutzername. Seiten können privat bleiben, dem Zirkel freigegeben oder für alle sichtbaren Personen geteilt werden. Der Inhalt bleibt als MediaWiki-Text erhalten und kann importiert oder exportiert werden.
      </PageGuide>
    </AppShell>
  );
}
