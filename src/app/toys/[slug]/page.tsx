import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Download, Pencil, Printer } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { CopyLink } from "@/components/copy-link";
import { PageGuide, PageHeader, Panel, SoftPanel } from "@/components/ui";
import { isAccessibleOwner, contentTenantScope } from "@/lib/access";
import { currentUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { hasFeature, requireFeature } from "@/lib/features";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/dates";

export default async function ToyDetailPage({ params }: { params: { slug: string } }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  await requireFeature("toys");
  const positionsEnabled = await hasFeature("positions");
  const toy = await prisma.toy.findFirst({ where: { slug: params.slug, ...contentTenantScope(user) }, include: { positions: positionsEnabled, activities: true } });
  if (!toy || !(await isAccessibleOwner(user, toy.ownerId))) notFound();
  const url = `${env.appUrl}/toys/${toy.slug}`;
  const displayUrl = url.replace(/^https?:\/\//, "");

  return (
    <AppShell>
      <PageHeader
        title={toy.title}
        subtitle={displayUrl}
      />
      <PageGuide>
        Diese Detailseite zeigt Bild, Beschreibung, Zeitstempel, QR-Code und alle Verknüpfungen dieses Spielzeugs. Nutze Bearbeiten, um Text, Slug oder Bild zu ändern; der QR-Code fuehrt dauerhaft auf diese URL.
      </PageGuide>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Panel>
          <div className="aspect-[16/10] overflow-hidden rounded-md bg-paper">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={toy.imageUrl || "/toy-placeholder.svg"} alt="" className="h-full w-full object-cover" />
          </div>
          <p className="mt-5 leading-7 text-graphite">{toy.description || "Keine Beschreibung hinterlegt."}</p>
          <div className="mt-5 grid gap-3 text-sm text-graphite sm:grid-cols-2">
            <div>Erstellt: {formatDateTime(toy.createdAt)}</div>
            <div>Aktualisiert: {formatDateTime(toy.updatedAt)}</div>
          </div>
        </Panel>
        <div className="space-y-6">
          <SoftPanel>
            <h2 className="mb-3 text-lg font-semibold">QR-Code</h2>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/qr?url=${encodeURIComponent(url)}`} alt={`QR-Code für ${toy.title}`} className="mx-auto h-56 w-56 rounded-md bg-white p-3" />
            <div className="mt-4 grid grid-cols-2 gap-2">
              <a href={`/api/qr?download=1&url=${encodeURIComponent(url)}`} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-redbrand px-3 py-2 text-sm font-semibold text-white">
                <Download className="h-4 w-4" />
                Download
              </a>
              <a href={`/api/qr?url=${encodeURIComponent(url)}`} target="_blank" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-line bg-surface px-3 py-2 text-sm font-semibold text-ink hover:bg-paper" rel="noreferrer">
                <Printer className="h-4 w-4" />
                Drucken
              </a>
            </div>
          </SoftPanel>
          <Panel>
            <h2 className="mb-3 text-lg font-semibold">Verknüpfungen</h2>
            <div className="space-y-2 text-sm">
              {positionsEnabled ? toy.positions.map((position) => (
                <Link key={position.id} href={`/positions/${position.slug}`} className="block rounded-md bg-paper px-3 py-2 hover:text-redbrand">{position.name}</Link>
              )) : null}
              {toy.activities.map((activity) => (
                <Link key={activity.id} href={`/activities/${activity.slug}`} className="block rounded-md bg-paper px-3 py-2 hover:text-redbrand">{activity.title}</Link>
              ))}
              {(!positionsEnabled || !toy.positions.length) && !toy.activities.length ? <p className="text-graphite">Noch keine Verknüpfungen.</p> : null}
            </div>
          </Panel>
        </div>
      </div>
      <Panel className="mt-6">
        <h2 className="mb-2 text-lg font-semibold">Aktionen</h2>
        <p className="mb-4 text-sm text-graphite">Ändere diesen Eintrag nur, wenn Bild, Text, Slug oder Beschreibung aktualisiert werden sollen.</p>
        <div className="flex flex-wrap items-center gap-3">
          <Link href={`/toys/${toy.slug}/edit`} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-line bg-surface px-4 py-2 text-sm font-semibold hover:bg-paper">
            <Pencil className="h-4 w-4" />
            Bearbeiten
          </Link>
          <CopyLink value={displayUrl} label={displayUrl} />
        </div>
      </Panel>
    </AppShell>
  );
}
