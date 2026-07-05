import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { PageGuide, PageHeader } from "@/components/ui";
import { accessibleOwnerIds } from "@/lib/access";
import { currentUser } from "@/lib/auth";
import { requireFeature } from "@/lib/features";
import { prisma } from "@/lib/prisma";
import { wikiEditablePage, wikiOwnerBySlug } from "@/lib/wiki";
import { updateWikiPage } from "../../../actions";
import { WikiForm } from "../../../wiki-form";

export default async function EditWikiPage({ params }: { params: { ownerSlug: string; slug: string } }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  await requireFeature("wiki");
  const owner = await wikiOwnerBySlug(params.ownerSlug, user);
  if (!owner) notFound();
  const found = await prisma.wikiPage.findFirst({ where: { ownerId: owner.id, slug: params.slug, ...(user.tenantId ? { tenantId: user.tenantId } : {}) } });
  if (!found) notFound();
  const page = await wikiEditablePage(user, found.id);
  if (!page) redirect(`/wiki/${params.ownerSlug}/${params.slug}`);
  const ownerIds = await accessibleOwnerIds(user);
  const [users, circles] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: ownerIds.filter((id) => id !== page.ownerId) }, active: true },
      include: { profile: true },
      orderBy: [{ name: "asc" }, { email: "asc" }]
    }),
    prisma.circle.findMany({ where: { ...(user.tenantId ? { tenantId: user.tenantId } : {}) }, orderBy: { name: "asc" } })
  ]);
  return (
    <AppShell>
      <PageHeader title={`Wiki bearbeiten: ${page.title}`} />
      <WikiForm action={updateWikiPage} page={page} users={users} circles={circles} />
      <PageGuide title="Freigaben bearbeiten">
        Besitzer und Administratoren können Titel, Slug, MediaWiki-Text und Freigaben ändern. Der Slug bleibt lesbar und eindeutig innerhalb dieses Benutzer-Wikis.
      </PageGuide>
    </AppShell>
  );
}
