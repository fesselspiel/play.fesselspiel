import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { SortableToyList } from "@/components/sortable-catalog";
import { EmptyState, PageGuide, PageHeader } from "@/components/ui";
import { ownerScope } from "@/lib/access";
import { currentUser } from "@/lib/auth";
import { hasFeature, requireFeature } from "@/lib/features";
import { prisma } from "@/lib/prisma";

export default async function ToysPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  await requireFeature("toys");
  const positionsEnabled = await hasFeature("positions");
  const toys = await prisma.toy.findMany({ where: await ownerScope(user), include: { positions: positionsEnabled, activities: true }, orderBy: [{ sortOrder: "asc" }, { title: "asc" }] });

  return (
    <AppShell>
      <PageHeader
        title="Spielzeugkatalog"
        action={
          <Link href="/toys/new" className="inline-flex min-h-10 items-center gap-2 rounded-md bg-redbrand px-4 py-2 text-sm font-semibold text-white">
            <Plus className="h-4 w-4" />
            Spielzeug
          </Link>
        }
      />
      <PageGuide title="Persönliche Ausrüstung mit Bildern und Verknüpfungen">
        Hier verwaltest du deinen Spielzeugkatalog. Öffne einen Eintrag für Details, QR-Code und Verknüpfungen oder lege über den roten Button ein neues Spielzeug mit Bild, Beschreibung und passenden Szenen an.
      </PageGuide>
      {toys.length ? (
        <SortableToyList canSort={user.role === "ADMIN" || user.role === "SUPER_ADMIN"} items={toys.map((toy) => ({
          id: toy.id,
          title: toy.title,
          slug: toy.slug,
          description: toy.description,
          imageUrl: toy.imageUrl,
          positionCount: positionsEnabled ? toy.positions.length : 0,
          activityCount: toy.activities.length
        }))} />
      ) : (
        <EmptyState title="Noch keine Spielzeuge angelegt">
          <Link href="/toys/new" className="font-semibold text-redbrand">Ersten Eintrag erstellen</Link>
        </EmptyState>
      )}
    </AppShell>
  );
}
