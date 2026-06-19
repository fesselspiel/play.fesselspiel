import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { SortableToyList } from "@/components/sortable-catalog";
import { EmptyState, PageGuide, PageHeader } from "@/components/ui";
import { ownerScope } from "@/lib/access";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function ToysPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const toys = await prisma.toy.findMany({ where: await ownerScope(user), include: { positions: true, activities: true }, orderBy: [{ sortOrder: "asc" }, { title: "asc" }] });

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
      <PageGuide title="Persoenliche Ausruestung mit Slug-URLs und QR-Codes">
        Hier verwaltest du deinen Spielzeugkatalog. Oeffne einen Eintrag fuer Details, QR-Code und Verknuepfungen oder lege ueber den roten Button ein neues Spielzeug mit Bild, Beschreibung und eigener URL an.
      </PageGuide>
      {toys.length ? (
        <SortableToyList items={toys.map((toy) => ({
          id: toy.id,
          title: toy.title,
          slug: toy.slug,
          description: toy.description,
          imageUrl: toy.imageUrl,
          positionCount: toy.positions.length,
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
