import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ArrowLeft, CheckCircle2, Plus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ShareButton } from "@/components/share-button";
import { Button, EmptyState, Field, PageGuide, PageHeader, Panel, inputClass, selectClass } from "@/components/ui";
import { ownerScope } from "@/lib/access";
import { logAction } from "@/lib/audit";
import { currentUser } from "@/lib/auth";
import { requireFeature } from "@/lib/features";
import { packingListInclude, packingVisibilityScope, serializePackingList } from "@/lib/packing";
import { prisma } from "@/lib/prisma";
import { shareTargetsForUser } from "@/lib/share";

export const dynamic = "force-dynamic";

function formText(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

async function addItem(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  await requireFeature("packingLists");
  const listId = formText(formData, "listId");
  const toyId = formText(formData, "toyId");
  const list = await prisma.packingList.findFirst({ where: { id: listId, ...packingVisibilityScope(user) }, include: { items: true } });
  if (!list || !toyId) redirect("/packing");
  await prisma.packingListItem.upsert({
    where: { listId_toyId: { listId, toyId } },
    update: { quantity: { increment: 1 }, note: formText(formData, "note") || null },
    create: { listId, toyId, sortOrder: list.items.length, note: formText(formData, "note") || null }
  });
  await logAction({ actorId: user.id, action: "packing_item_added", entityType: "packingList", entityId: list.id, title: `Spielzeug zur Packliste hinzugefügt: ${list.title}`, href: `/packing/${list.slug}`, details: { toyId } });
  revalidatePath(`/packing/${list.slug}`);
  redirect(`/packing/${list.slug}`);
}

async function toggleItem(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  await requireFeature("packingLists");
  const itemId = formText(formData, "itemId");
  const item = await prisma.packingListItem.findUnique({ where: { id: itemId }, include: { list: true } });
  if (!item) redirect("/packing");
  const packed = formData.get("packed") === "on";
  await prisma.packingListItem.update({ where: { id: item.id }, data: { packed, packedAt: packed ? new Date() : null, packedById: packed ? user.id : null } });
  await logAction({ actorId: user.id, action: packed ? "packing_item_packed" : "packing_item_unpacked", entityType: "packingListItem", entityId: item.id, title: `${packed ? "Eingepackt" : "Ausgepackt"}: ${item.list.title}`, href: `/packing/${item.list.slug}`, details: { listId: item.listId, toyId: item.toyId } });
  revalidatePath(`/packing/${item.list.slug}`);
  redirect(`/packing/${item.list.slug}`);
}

export default async function PackingDetailPage({ params }: { params: { slug: string } }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  await requireFeature("packingLists");
  const list = await prisma.packingList.findFirst({ where: { slug: params.slug, ...packingVisibilityScope(user) }, include: packingListInclude });
  if (!list) redirect("/packing");
  const view = serializePackingList(list, user);
  const [toys, shareTargets] = await Promise.all([
    prisma.toy.findMany({ where: await ownerScope(user), orderBy: [{ sortOrder: "asc" }, { title: "asc" }], include: { category: true } }),
    shareTargetsForUser(user)
  ]);

  return (
    <AppShell>
      <PageHeader
        title={view.title}
        subtitle={view.packingEvent?.title || view.event?.title || "Packliste"}
        action={<Link href="/packing" className="inline-flex min-h-10 items-center gap-2 rounded-md border border-line bg-surface px-4 py-2 text-sm font-semibold hover:bg-paper"><ArrowLeft className="h-4 w-4" /> Zurück</Link>}
      />
      <PageGuide title="Packliste im Detail">
        In der Detailansicht siehst du alle Spielsachen groß, kannst Packstatus setzen und neue Spielsachen ergänzen. Die Liste bleibt mit Pack-Event und Event verknüpft.
      </PageGuide>
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <Panel>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-ink">Inhalt</h2>
              <p className="text-sm text-graphite">{view.progress.packed}/{view.progress.total} eingepackt</p>
            </div>
            <span className="rounded-md bg-paper px-3 py-2 text-sm font-semibold text-graphite">{view.progress.percent}%</span>
          </div>
          <div className="mb-5 h-2 overflow-hidden rounded-full bg-paper"><div className="h-full bg-redbrand" style={{ width: `${view.progress.percent}%` }} /></div>
          {view.items.length ? (
            <div className="grid gap-3">
              {view.items.map((item: any) => (
                <form key={item.id} action={toggleItem} className={`grid gap-3 rounded-lg border border-line p-3 sm:grid-cols-[auto_72px_1fr_auto] sm:items-center ${item.packed ? "bg-emerald-50/70 dark:bg-emerald-950/20" : "bg-paper"}`}>
                  <input type="hidden" name="itemId" value={item.id} />
                  <input type="hidden" name="packed" value={item.packed ? "off" : "on"} />
                  <button
                    type="submit"
                    className={`flex h-9 w-9 items-center justify-center rounded-md border border-line ${item.packed ? "bg-emerald-600 text-white" : "bg-surface text-graphite"}`}
                    aria-label={item.packed ? "Als nicht gepackt markieren" : "Als gepackt markieren"}
                  >
                    {item.packed ? <CheckCircle2 className="h-5 w-5" /> : <span className="h-4 w-4 rounded border border-current" />}
                  </button>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.toy.imageUrl} alt="" className="h-20 w-20 rounded-md object-contain" />
                  <div>
                    <Link href={item.toy.href} className="font-semibold text-ink hover:text-redbrand">{item.toy.title}</Link>
                    <div className="mt-1 text-sm text-graphite">{item.quantity}x {item.note ? `· ${item.note}` : ""}</div>
                    {item.packedBy ? <div className="mt-1 text-xs text-graphite">Gepackt von {item.packedBy.displayName}</div> : null}
                  </div>
                </form>
              ))}
            </div>
          ) : <EmptyState title="Noch kein Spielzeug in der Liste" />}
        </Panel>
        <div className="space-y-5">
          <Panel>
            <h2 className="mb-3 text-lg font-semibold text-ink">Verknüpfungen</h2>
            <div className="grid gap-2 text-sm text-graphite">
              <span>Besitzer: {view.owner.displayName}</span>
              <span>Sichtbarkeit: {view.visibility}</span>
              {view.packingEvent ? <span>Pack-Event: {view.packingEvent.title}</span> : null}
              {view.event ? <span>Event: {view.event.title}</span> : null}
            </div>
            <div className="mt-4">
              <ShareButton entityType="packingList" entityId={view.id} title={view.title} href={view.href} text={view.note} targets={shareTargets} defaultChannel={user.settings?.shareDefaultChannel} messageTemplate={user.settings?.shareMessageTemplate} />
            </div>
          </Panel>
          <Panel>
            <h2 className="mb-3 text-lg font-semibold text-ink">Spielzeug hinzufügen</h2>
            <form action={addItem} className="grid gap-3">
              <input type="hidden" name="listId" value={view.id} />
              <Field label="Spielzeug">
                <select name="toyId" className={selectClass} required>
                  <option value="">Auswählen</option>
                  {toys.map((toy) => <option key={toy.id} value={toy.id}>{toy.title}</option>)}
                </select>
              </Field>
              <Field label="Notiz"><input name="note" className={inputClass} /></Field>
              <Button><Plus className="h-4 w-4" /> Hinzufügen</Button>
            </form>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
