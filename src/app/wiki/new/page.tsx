import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { PageGuide, PageHeader } from "@/components/ui";
import { accessibleOwnerIds } from "@/lib/access";
import { currentUser } from "@/lib/auth";
import { requireFeature } from "@/lib/features";
import { prisma } from "@/lib/prisma";
import { createWikiPage } from "../actions";
import { WikiForm } from "../wiki-form";

export default async function NewWikiPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  await requireFeature("wiki");
  const ownerIds = await accessibleOwnerIds(user);
  const [users, circles] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: ownerIds.filter((id) => id !== user.id) }, active: true },
      include: { profile: true },
      orderBy: [{ name: "asc" }, { email: "asc" }]
    }),
    prisma.circle.findMany({ where: { ...(user.tenantId ? { tenantId: user.tenantId } : {}) }, orderBy: { name: "asc" } })
  ]);
  return (
    <AppShell>
      <PageHeader title="Wiki-Seite anlegen" />
      <WikiForm action={createWikiPage} users={users} circles={circles} />
      <PageGuide title="MediaWiki-kompatibel schreiben">
        Du kannst MediaWiki-Text direkt einfügen. Überschriften, Listen, fett, kursiv und interne Links bleiben erhalten. Der Export liefert den Rohtext als .wiki-Datei.
      </PageGuide>
    </AppShell>
  );
}
