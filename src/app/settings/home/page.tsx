import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { SortableHomeLayout } from "@/components/sortable-home-layout";
import { PageGuide, PageHeader, Panel } from "@/components/ui";
import { currentSessionContext } from "@/lib/auth";
import { homeSections, normalizeHomeLayout } from "@/lib/home-layout";

export default async function HomeSettingsPage({ searchParams }: { searchParams: { saved?: string } }) {
  const { actor, tenant } = await currentSessionContext();
  if (!actor) redirect("/login");
  if (actor.role !== "ADMIN" && actor.role !== "SUPER_ADMIN") redirect("/");
  if (!tenant) redirect("/");
  const layout = normalizeHomeLayout((tenant as { homeLayout?: unknown }).homeLayout);
  const sectionByKey = new Map(homeSections.map((section) => [section.key, section]));
  const items = layout.map((key) => sectionByKey.get(key)).filter(Boolean) as Array<typeof homeSections[number]>;
  return (
    <AppShell>
      <PageHeader title="Startseite" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Panel>
          {searchParams.saved ? <p className="mb-4 rounded-md border border-line bg-paper p-3 text-sm text-graphite">Startseite gespeichert.</p> : null}
          <SortableHomeLayout items={items} />
        </Panel>
        <PageGuide title="Startseite sortieren">
          Verschiebe die Startseitenbereiche mit den Pfeilen nach oben oder unten. Die Reihenfolge wird direkt gespeichert. Sichtbar werden nur Bereiche, deren Feature auf dieser Seite aktiv ist und für die Daten vorhanden sind.
        </PageGuide>
      </div>
    </AppShell>
  );
}
