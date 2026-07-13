import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, Clock3, Plus, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge, EmptyState, PageGuide, PageHeader, Panel, selectClass } from "@/components/ui";
import { ownerScope } from "@/lib/access";
import { updateSelfBondageOrderStatus, selfBondageCategory } from "@/lib/activity-orders";
import { activityStatusDisplay, activityStatusTone, type ActivityStatusValue } from "@/lib/activity-status";
import { currentUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { requireFeature } from "@/lib/features";
import { prisma } from "@/lib/prisma";

const statusOptions: ActivityStatusValue[] = ["REQUESTED", "PLANNED", "DONE", "DISCARDED"];

export const dynamic = "force-dynamic";

function statusHeadline(status: ActivityStatusValue) {
  if (status === "REQUESTED") return "Beauftragt";
  if (status === "PLANNED") return "Angenommen";
  if (status === "DONE") return "Umgesetzt";
  return "Verworfen";
}

export default async function OrdersPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  await requireFeature("orders");
  const orders = await prisma.activityPlan.findMany({
    where: { ...(await ownerScope(user)), category: selfBondageCategory },
    include: {
      owner: { include: { profile: true } },
      positions: true
    },
    orderBy: [
      { status: "asc" },
      { plannedAt: "asc" },
      { createdAt: "desc" }
    ]
  });
  const openOrders = orders.filter((order) => order.status === "REQUESTED" || order.status === "PLANNED");
  const statusActors = new Map(
    (orders.length
      ? await prisma.auditLog.findMany({
          where: {
            entityType: "activity",
            entityId: { in: orders.map((order) => order.id) },
            action: { in: ["self_bondage_order_accepted", "self_bondage_order_completed", "self_bondage_order_discarded"] }
          },
          include: { actor: { include: { profile: true } } },
          orderBy: { createdAt: "desc" }
        })
      : []
    ).map((entry) => [
      `${entry.entityId}:${entry.action}`,
      entry.actor?.profile?.displayName || entry.actor?.name || entry.actor?.username || entry.actor?.email || "Unbekannt"
    ])
  );

  return (
    <AppShell>
      <PageHeader
        title="Aufträge"
        action={
          <Link href="/activities/new?template=self-bondage" className="inline-flex min-h-10 items-center gap-2 rounded-md bg-redbrand px-4 py-2 text-sm font-semibold text-white hover:bg-redbrandHover">
            <Plus className="h-4 w-4" />
            Auftrag erteilen
          </Link>
        }
      />
      {openOrders.length ? (
        <Panel className="mb-6 border-sky-600 bg-sky-600/10">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-xl font-semibold text-ink">
                <ShieldCheck className="h-5 w-5 text-sky-700" />
                {openOrders.some((order) => order.status === "REQUESTED") && openOrders.some((order) => order.status === "PLANNED")
                  ? `${openOrders.length} aktive Aufträge`
                  : openOrders.some((order) => order.status === "PLANNED")
                    ? openOrders.length === 1 ? "Ein angenommener Auftrag wartet" : `${openOrders.length} angenommene Aufträge warten`
                    : openOrders.length === 1 ? "Ein offener Auftrag wartet" : `${openOrders.length} offene Aufträge warten`}
              </h2>
              <p className="mt-1 text-sm text-graphite">Beauftragte Aufträge warten auf Annahme, angenommene Aufträge auf Umsetzung.</p>
            </div>
            <Link href="#offen" className="inline-flex min-h-10 items-center justify-center rounded-md border border-sky-600 bg-surface px-4 py-2 text-sm font-semibold text-sky-700 hover:bg-paper">
              Offene ansehen
            </Link>
          </div>
        </Panel>
      ) : null}
      <PageGuide title="Aufträge annehmen und umsetzen">
        Aufträge sind private Vorschlaege aus dem Kreis. Wer den Auftrag nicht selbst erteilt hat, kann ihn annehmen, eine Aenderung vorschlagen, spaeter entscheiden oder ablehnen. Eine Zustimmung kann jederzeit widerrufen werden.
      </PageGuide>

      {orders.length ? (
        <div id="offen" className="space-y-4">
          {orders.map((order) => {
            const status = order.status as ActivityStatusValue;
            const ownerName = order.owner.profile?.displayName || order.owner.name || order.owner.username || order.owner.email;
            const canAccept = status === "REQUESTED" && order.ownerId !== user.id;
            const acceptedBy = status === "PLANNED" ? statusActors.get(`${order.id}:self_bondage_order_accepted`) : "";
            const completedBy = status === "DONE" ? statusActors.get(`${order.id}:self_bondage_order_completed`) : "";
            return (
              <Panel key={order.id} id={`order-${order.id}`} className={status === "REQUESTED" || status === "PLANNED" ? "border-sky-600" : ""}>
                <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge tone={activityStatusTone(status)}>{activityStatusDisplay(status, true)}</Badge>
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-graphite">
                        {status === "DONE" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Clock3 className="h-3.5 w-3.5" />}
                        {statusHeadline(status)}
                      </span>
                    </div>
                    <h2 className="text-xl font-semibold text-ink">
                      <Link href={`/activities/${order.slug}`} className="hover:text-redbrand">{order.title}</Link>
                    </h2>
                    <p className="mt-1 text-sm text-graphite">
                      Erteilt von {ownerName} · {order.plannedAt ? formatDateTime(order.plannedAt) : "gilt beim Lesen"}
                    </p>
                    {acceptedBy || completedBy ? (
                      <p className="mt-1 text-sm font-semibold text-graphite">
                        {completedBy ? `Umgesetzt von ${completedBy}` : `Angenommen von ${acceptedBy}`}
                      </p>
                    ) : null}
                    {order.positions.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {order.positions.map((position) => (
                          <Link key={position.id} href={`/positions/${position.slug}`} className="rounded-md bg-paper px-2 py-1 text-xs font-semibold text-graphite hover:text-redbrand">
                            {position.name}
                          </Link>
                        ))}
                      </div>
                    ) : null}
                    <p className="mt-4 whitespace-pre-line text-sm leading-6 text-graphite">{order.note || "Keine Anweisung hinterlegt."}</p>
                  </div>
                  <div className="rounded-lg border border-line bg-paper p-3">
                    {order.ownerId === user.id ? (
                      <p className="mb-3 rounded-md bg-surface p-3 text-xs text-graphite">
                        Du hast diesen Auftrag erteilt. Annehmen sollen ihn die anderen im Kreis.
                      </p>
                    ) : null}
                    <form action={updateSelfBondageOrderStatus} className="space-y-3">
                      <input type="hidden" name="id" value={order.id} />
                      <label className="block text-sm font-medium text-graphite">
                        <span className="mb-1 block">Status</span>
                        <select className={selectClass} name="status" defaultValue={status}>
                          {statusOptions.map((value) => {
                            const disabled = value === "PLANNED" && order.ownerId === user.id;
                            return <option key={value} value={value} disabled={disabled}>{activityStatusDisplay(value, true)}</option>;
                          })}
                        </select>
                      </label>
                      <button className="focus-ring inline-flex min-h-10 w-full items-center justify-center rounded-md bg-redbrand px-4 py-2 text-sm font-semibold text-white hover:bg-redbrandHover">
                        Status speichern
                      </button>
                    </form>
                    {canAccept ? (
                      <form action={updateSelfBondageOrderStatus} className="mt-2">
                        <input type="hidden" name="id" value={order.id} />
                        <input type="hidden" name="status" value="PLANNED" />
                        <button className="focus-ring inline-flex min-h-10 w-full items-center justify-center rounded-md border border-line bg-surface px-4 py-2 text-sm font-semibold hover:bg-paper">
                          Auftrag annehmen
                        </button>
                      </form>
                    ) : null}
                    <Link href={`/activities/${order.slug}`} className="mt-2 inline-flex min-h-10 w-full items-center justify-center rounded-md border border-line bg-surface px-4 py-2 text-sm font-semibold hover:bg-paper">
                      Detail öffnen
                    </Link>
                    <Link href={`/activities/${order.slug}/edit`} className="mt-2 inline-flex min-h-10 w-full items-center justify-center rounded-md border border-line bg-surface px-4 py-2 text-sm font-semibold hover:bg-paper">
                      Bearbeiten
                    </Link>
                  </div>
                </div>
              </Panel>
            );
          })}
        </div>
      ) : (
        <EmptyState title="Noch keine Aufträge">
          <Link href="/activities/new?template=self-bondage" className="font-semibold text-redbrand">Ersten Auftrag erteilen</Link>
        </EmptyState>
      )}
    </AppShell>
  );
}
