import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { CalendarDays, CheckCircle2, Luggage, PackagePlus, Plus, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ShareButton } from "@/components/share-button";
import { Button, EmptyState, Field, PageGuide, PageHeader, Panel, inputClass, selectClass } from "@/components/ui";
import { ownerScope } from "@/lib/access";
import { logAction } from "@/lib/audit";
import { currentUser } from "@/lib/auth";
import { requireFeature } from "@/lib/features";
import { packingEventInclude, packingListInclude, packingVisibilityScope, serializePackingEvent, serializePackingList } from "@/lib/packing";
import { prisma } from "@/lib/prisma";
import { shareTargetsForUser } from "@/lib/share";
import { uniqueSlug } from "@/lib/slug";

export const dynamic = "force-dynamic";

function formText(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function formDate(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function createPackingEvent(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  await requireFeature("packingLists");
  const title = formText(formData, "title");
  if (!title) redirect("/packing?error=title");
  const eventId = formText(formData, "eventId") || null;
  const packingEvent = await prisma.packingEvent.create({
    data: {
      tenantId: user.tenantId,
      ownerId: user.id,
      title,
      slug: await uniqueSlug("packingEvent", title, user.tenantId),
      description: formText(formData, "description") || null,
      location: formText(formData, "location") || null,
      startsAt: formDate(formText(formData, "startsAt")),
      visibility: (formText(formData, "visibility") || "PARTNER") as "PRIVATE" | "PARTNER" | "SHARED",
      eventId
    }
  });
  await logAction({ actorId: user.id, action: "packing_event_created", entityType: "packingEvent", entityId: packingEvent.id, title: `Pack-Event angelegt: ${packingEvent.title}`, href: "/packing", details: { eventId, packingEventId: packingEvent.id } });
  revalidatePath("/packing");
  redirect(`/packing?packingEvent=${packingEvent.id}`);
}

async function createList(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  await requireFeature("packingLists");
  const title = formText(formData, "title");
  if (!title) redirect("/packing?error=title");
  const packingEventId = formText(formData, "packingEventId") || null;
  const eventId = formText(formData, "eventId") || null;
  const toyIds = Array.from(new Set(formData.getAll("toyId").map(String).filter(Boolean)));
  const list = await prisma.packingList.create({
    data: {
      tenantId: user.tenantId,
      ownerId: user.id,
      title,
      slug: await uniqueSlug("packingList", title, user.tenantId),
      packingEventId,
      eventId,
      note: formText(formData, "note") || null,
      visibility: (formText(formData, "visibility") || "PARTNER") as "PRIVATE" | "PARTNER" | "SHARED",
      items: { create: toyIds.map((toyId, index) => ({ toyId, sortOrder: index })) }
    }
  });
  await logAction({ actorId: user.id, action: "packing_list_created", entityType: "packingList", entityId: list.id, title: `Packliste angelegt: ${list.title}`, href: `/packing/${list.slug}`, details: { packingEventId, eventId, itemCount: toyIds.length } });
  revalidatePath("/packing");
  redirect(`/packing/${list.slug}`);
}

async function addItem(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  await requireFeature("packingLists");
  const listId = formText(formData, "listId");
  const toyId = formText(formData, "toyId");
  if (!listId || !toyId) redirect("/packing");
  const list = await prisma.packingList.findFirst({ where: { id: listId, ...packingVisibilityScope(user) }, include: { items: true } });
  if (!list) redirect("/packing");
  await prisma.packingListItem.upsert({
    where: { listId_toyId: { listId, toyId } },
    update: { quantity: { increment: 1 } },
    create: { listId, toyId, sortOrder: list.items.length, note: formText(formData, "note") || null }
  });
  await logAction({ actorId: user.id, action: "packing_item_added", entityType: "packingList", entityId: list.id, title: `Spielzeug zur Packliste hinzugefügt: ${list.title}`, href: `/packing/${list.slug}`, details: { toyId } });
  revalidatePath("/packing");
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
  revalidatePath("/packing");
}

async function deleteList(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  await requireFeature("packingLists");
  const listId = formText(formData, "listId");
  const target = await prisma.packingList.findFirst({ where: { id: listId, ...(user.role === "ADMIN" || user.role === "SUPER_ADMIN" ? {} : { ownerId: user.id }) }, select: { id: true, title: true } });
  if (!target) redirect("/packing");
  await prisma.packingList.delete({ where: { id: target.id } });
  await logAction({ actorId: user.id, action: "packing_list_deleted", entityType: "packingList", entityId: target.id, title: `Packliste gelöscht: ${target.title}`, href: "/packing" });
  revalidatePath("/packing");
  redirect("/packing");
}

function progressClass(percent: number) {
  if (percent >= 100) return "bg-emerald-500";
  if (percent >= 50) return "bg-redbrand";
  return "bg-graphite";
}

export default async function PackingPage({ searchParams }: { searchParams?: { packingEvent?: string; error?: string } }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  await requireFeature("packingLists");
  const scope = await ownerScope(user);
  const [packingEvents, lists, toys, events, shareTargets] = await Promise.all([
    prisma.packingEvent.findMany({ where: packingVisibilityScope(user), include: packingEventInclude, orderBy: [{ startsAt: "asc" }, { createdAt: "desc" }] }),
    prisma.packingList.findMany({ where: packingVisibilityScope(user), include: packingListInclude, orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }] }),
    prisma.toy.findMany({ where: scope, orderBy: [{ sortOrder: "asc" }, { title: "asc" }], include: { category: true } }),
    prisma.event.findMany({ where: scope, orderBy: { startsAt: "asc" }, take: 50 }),
    shareTargetsForUser(user)
  ]);
  const eventViews = packingEvents.map((entry) => serializePackingEvent(entry, user));
  const listViews = lists.map((list) => serializePackingList(list, user));
  const selectedPackingEventId = searchParams?.packingEvent || "";

  return (
    <AppShell>
      <PageHeader
        title="Packlisten"
        subtitle="Pack-Events planen, Spielzeug einpacken und alles mit Events verknüpfen."
        action={<a href="#new-list" className="inline-flex min-h-10 items-center gap-2 rounded-md bg-redbrand px-4 py-2 text-sm font-semibold text-white"><PackagePlus className="h-4 w-4" /> Packliste</a>}
      />
      <PageGuide title="Packlisten und Pack-Events">
        Lege ein Pack-Event an, verknüpfe es mit einem Event und erstelle dazu eine oder mehrere Packlisten. Spielzeuge können direkt markiert werden, sobald sie eingepackt sind. Sichtbarkeit steuert, ob nur du, dein Zirkel oder alle auf der Seite die Liste sehen.
      </PageGuide>

      <div className="mb-6 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Panel className="bg-gradient-to-br from-redbrand/10 via-surface to-paper">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-md bg-redbrand text-white"><Luggage className="h-6 w-6" /></span>
            <div>
              <h2 className="text-xl font-semibold text-ink">Nächste Pack-Aktionen</h2>
              <p className="text-sm text-graphite">Alles, was vor dem nächsten Pack-Event noch offen ist.</p>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-md bg-surface p-4"><div className="text-2xl font-semibold text-ink">{listViews.length}</div><div className="text-sm text-graphite">Packlisten</div></div>
            <div className="rounded-md bg-surface p-4"><div className="text-2xl font-semibold text-ink">{listViews.reduce((sum, list) => sum + list.progress.open, 0)}</div><div className="text-sm text-graphite">noch offen</div></div>
            <div className="rounded-md bg-surface p-4"><div className="text-2xl font-semibold text-ink">{eventViews.length}</div><div className="text-sm text-graphite">Pack-Events</div></div>
          </div>
        </Panel>

        <details className="rounded-lg border border-line bg-surface p-5 shadow-soft">
          <summary className="flex cursor-pointer list-none items-center justify-between text-base font-semibold text-ink [&::-webkit-details-marker]:hidden">
            <span className="inline-flex items-center gap-2"><CalendarDays className="h-5 w-5 text-redbrand" /> Pack-Event anlegen</span>
            <span className="rounded-md bg-paper px-2 py-1 text-xs text-graphite">Popup öffnen</span>
          </summary>
          <form action={createPackingEvent} className="mt-4 grid gap-3">
            <Field label="Titel"><input name="title" required className={inputClass} placeholder="Studioabend, Wochenende, Party..." /></Field>
            <Field label="Event verknüpfen"><select name="eventId" className={selectClass} defaultValue=""><option value="">Kein Event</option>{events.map((event) => <option key={event.id} value={event.id}>{event.title} · {event.startsAt.toLocaleDateString("de-DE")}</option>)}</select></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Datum/Uhrzeit"><input name="startsAt" type="datetime-local" className={inputClass} /></Field>
              <Field label="Sichtbarkeit"><select name="visibility" className={selectClass} defaultValue="PARTNER"><option value="PRIVATE">Nur für mich</option><option value="PARTNER">Zirkel</option><option value="SHARED">Alle auf der Seite</option></select></Field>
            </div>
            <Field label="Ort"><input name="location" className={inputClass} /></Field>
            <Field label="Beschreibung"><textarea name="description" className={inputClass} rows={3} /></Field>
            <Button><Plus className="h-4 w-4" /> Pack-Event speichern</Button>
          </form>
        </details>
      </div>

      <section className="mb-6 grid gap-4">
        <h2 className="text-lg font-semibold text-ink">Pack-Events</h2>
        {eventViews.length ? (
          <div className="grid gap-4 md:grid-cols-2">
            {eventViews.map((entry: any) => (
              <details key={entry.id} open={entry.id === selectedPackingEventId} className="overflow-hidden rounded-lg border border-line bg-surface shadow-soft">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 bg-paper px-4 py-3 [&::-webkit-details-marker]:hidden">
                  <span><span className="block font-semibold text-ink">{entry.title}</span><span className="text-xs text-graphite">{entry.event ? `Event: ${entry.event.title}` : entry.startsAt ? new Date(entry.startsAt).toLocaleString("de-DE") : "ohne Datum"}</span></span>
                  <span className="rounded-md bg-surface px-2 py-1 text-xs font-semibold text-graphite">{entry.progress.percent}%</span>
                </summary>
                <div className="space-y-3 p-4">
                  <div className="h-2 overflow-hidden rounded-full bg-paper"><div className={`h-full ${progressClass(entry.progress.percent)}`} style={{ width: `${entry.progress.percent}%` }} /></div>
                  {entry.description ? <p className="text-sm leading-6 text-graphite">{entry.description}</p> : null}
                  <div className="grid gap-2 text-sm text-graphite"><span>{entry.progress.lists} Listen · {entry.progress.open} offen</span>{entry.location ? <span>Ort: {entry.location}</span> : null}</div>
                  <div className="grid gap-2">{entry.lists.map((list: any) => <Link key={list.id} href={list.href} className="rounded-md bg-paper px-3 py-2 text-sm font-semibold hover:text-redbrand">{list.title} · {list.packed}/{list.total}</Link>)}</div>
                  <ShareButton entityType="packingEvent" entityId={entry.id} title={entry.title} href={`/packing?packingEvent=${entry.id}`} text={entry.description} targets={shareTargets} defaultChannel={user.settings?.shareDefaultChannel} messageTemplate={user.settings?.shareMessageTemplate} />
                </div>
              </details>
            ))}
          </div>
        ) : <EmptyState title="Noch kein Pack-Event angelegt" />}
      </section>

      <Panel id="new-list" className="mb-6">
        <h2 className="mb-4 text-lg font-semibold text-ink">Neue Packliste</h2>
        <form action={createList} className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Titel"><input name="title" required className={inputClass} placeholder="Koffer, Studio-Tasche, Notfallbox..." /></Field>
            <Field label="Sichtbarkeit"><select name="visibility" className={selectClass} defaultValue="PARTNER"><option value="PRIVATE">Nur für mich</option><option value="PARTNER">Zirkel</option><option value="SHARED">Alle auf der Seite</option></select></Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Pack-Event"><select name="packingEventId" className={selectClass} defaultValue={selectedPackingEventId}><option value="">Kein Pack-Event</option>{packingEvents.map((entry) => <option key={entry.id} value={entry.id}>{entry.title}</option>)}</select></Field>
            <Field label="Event"><select name="eventId" className={selectClass} defaultValue=""><option value="">Kein Event</option>{events.map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}</select></Field>
          </div>
          <Field label="Notiz"><textarea name="note" className={inputClass} rows={3} placeholder="Was ist wichtig, was darf nicht fehlen?" /></Field>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-graphite">Spielzeuge direkt hinzufügen</h3>
            <div className="grid max-h-72 gap-2 overflow-y-auto rounded-lg border border-line bg-paper p-3 sm:grid-cols-2 lg:grid-cols-3">
              {toys.map((toy) => (
                <label key={toy.id} className="flex cursor-pointer items-center gap-3 rounded-md bg-surface p-2 text-sm hover:bg-canvas">
                  <input type="checkbox" name="toyId" value={toy.id} className="h-4 w-4 accent-redbrand" />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={toy.imageUrl || "/toy-placeholder.svg"} alt="" className="h-10 w-10 rounded-md object-contain" />
                  <span className="min-w-0"><span className="block truncate font-semibold text-ink">{toy.title}</span><span className="text-xs text-graphite">{toy.category?.name || "Allgemein"}</span></span>
                </label>
              ))}
            </div>
          </div>
          <Button><PackagePlus className="h-4 w-4" /> Packliste speichern</Button>
        </form>
      </Panel>

      <section className="grid gap-4">
        <h2 className="text-lg font-semibold text-ink">Packlisten</h2>
        {listViews.length ? listViews.map((list: any) => (
          <details key={list.id} open className="overflow-hidden rounded-lg border border-line bg-surface shadow-soft">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 bg-paper px-4 py-3 [&::-webkit-details-marker]:hidden">
              <span><span className="block font-semibold text-ink">{list.title}</span><span className="text-xs text-graphite">{list.packingEvent?.title || list.event?.title || "freie Liste"} · {list.owner.displayName}</span></span>
              <span className="rounded-md bg-surface px-2 py-1 text-xs font-semibold text-graphite">{list.progress.packed}/{list.progress.total}</span>
            </summary>
            <div className="grid gap-4 p-4 lg:grid-cols-[1fr_260px]">
              <div className="space-y-3">
                <div className="h-2 overflow-hidden rounded-full bg-paper"><div className={`h-full ${progressClass(list.progress.percent)}`} style={{ width: `${list.progress.percent}%` }} /></div>
                {list.note ? <p className="text-sm leading-6 text-graphite">{list.note}</p> : null}
                <div className="grid gap-2">
                  {list.items.map((item: any) => (
                    <form key={item.id} action={toggleItem} className={`flex items-center gap-3 rounded-md border border-line p-2 ${item.packed ? "bg-emerald-50/60 dark:bg-emerald-950/20" : "bg-paper"}`}>
                      <input type="hidden" name="itemId" value={item.id} />
                      <input type="hidden" name="packed" value={item.packed ? "off" : "on"} />
                      <button
                        type="submit"
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-line ${item.packed ? "bg-emerald-600 text-white" : "bg-surface text-graphite"}`}
                        aria-label={item.packed ? "Als nicht gepackt markieren" : "Als gepackt markieren"}
                      >
                        {item.packed ? <CheckCircle2 className="h-5 w-5" /> : <span className="h-4 w-4 rounded border border-current" />}
                      </button>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.toy.imageUrl} alt="" className="h-12 w-12 rounded-md object-contain" />
                      <div className="min-w-0 flex-1"><Link href={item.toy.href} className="truncate font-semibold text-ink hover:text-redbrand">{item.toy.title}</Link><div className="text-xs text-graphite">{item.quantity}x {item.packedBy ? `· gepackt von ${item.packedBy.displayName}` : ""}</div></div>
                    </form>
                  ))}
                </div>
              </div>
              <div className="space-y-3">
                <Link href={list.href} className="inline-flex min-h-10 w-full items-center justify-center rounded-md bg-redbrand px-4 py-2 text-sm font-semibold text-white">Detail öffnen</Link>
                <ShareButton entityType="packingList" entityId={list.id} title={list.title} href={list.href} text={list.note} targets={shareTargets} defaultChannel={user.settings?.shareDefaultChannel} messageTemplate={user.settings?.shareMessageTemplate} />
                <details className="rounded-md border border-line bg-paper p-3">
                  <summary className="cursor-pointer list-none text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">Spielzeug hinzufügen</summary>
                  <form action={addItem} className="mt-3 grid gap-2">
                    <input type="hidden" name="listId" value={list.id} />
                    <select name="toyId" className={selectClass} required><option value="">Spielzeug auswählen</option>{toys.map((toy) => <option key={toy.id} value={toy.id}>{toy.title}</option>)}</select>
                    <input name="note" className={inputClass} placeholder="Notiz optional" />
                    <Button variant="secondary"><Plus className="h-4 w-4" /> Hinzufügen</Button>
                  </form>
                </details>
                {list.canManage ? <form action={deleteList}><input type="hidden" name="listId" value={list.id} /><Button variant="danger" className="w-full"><Trash2 className="h-4 w-4" /> Löschen</Button></form> : null}
              </div>
            </div>
          </details>
        )) : <EmptyState title="Noch keine Packliste angelegt" />}
      </section>
    </AppShell>
  );
}
