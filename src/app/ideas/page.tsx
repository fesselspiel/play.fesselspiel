import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronDown, Lightbulb, Plus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { LikeControl } from "@/components/like-control";
import { Badge, EmptyState, PageGuide, PageHeader } from "@/components/ui";
import { ownerScope } from "@/lib/access";
import { activityStatusDisplay, activityStatusTone } from "@/lib/activity-status";
import { logAction, userDisplayName } from "@/lib/audit";
import { currentUser } from "@/lib/auth";
import { hasFeature, requireFeature } from "@/lib/features";
import { fileAssetUrl } from "@/lib/files";
import { prisma } from "@/lib/prisma";

async function toggleIdeaLike(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  await requireFeature("ideas");
  const activityId = String(formData.get("activityId") || "");
  const idea = await prisma.activityPlan.findFirst({ where: { id: activityId, ...(await ownerScope(user)), category: "IDEA_COLLECTION" } });
  if (!idea) redirect("/ideas");
  const existing = await prisma.activityLike.findUnique({ where: { activityId_userId: { activityId: idea.id, userId: user.id } } });
  if (existing) {
    await prisma.activityLike.delete({ where: { id: existing.id } });
    await logAction({
      actorId: user.id,
      action: "idea_unliked",
      entityType: "activity",
      entityId: idea.id,
      title: `Idee-Like entfernt: ${idea.title}`,
      href: `/ideas/${idea.slug}`
    });
  } else {
    await prisma.activityLike.create({ data: { tenantId: user.tenantId || undefined, activityId: idea.id, userId: user.id } });
    await logAction({
      actorId: user.id,
      action: "idea_liked",
      entityType: "activity",
      entityId: idea.id,
      title: `Idee geliked: ${idea.title}`,
      href: `/ideas/${idea.slug}`
    });
  }
  redirect("/ideas");
}

export default async function IdeasPage() {
  await requireFeature("ideas");
  const user = await currentUser();
  if (!user) redirect("/login");
  const toolsEnabled = await hasFeature("toys");
  const positionsEnabled = await hasFeature("positions");
  const ideas = await prisma.activityPlan.findMany({
    where: { ...(await ownerScope(user)), category: "IDEA_COLLECTION" },
    include: {
      tools: toolsEnabled,
      positions: positionsEnabled,
      images: { include: { file: true }, orderBy: { createdAt: "desc" }, take: 1 },
      likes: { include: { user: { include: { profile: true } } }, orderBy: { createdAt: "asc" } }
    },
    orderBy: [{ updatedAt: "desc" }, { title: "asc" }]
  });

  return (
    <AppShell>
      <PageHeader
        title="Ideensammlung"
        action={
          <Link href="/activities/new?template=idea" className="inline-flex min-h-10 items-center gap-2 rounded-md bg-redbrand px-4 py-2 text-sm font-semibold text-white hover:bg-redbrandHover">
            <Plus className="h-4 w-4" />
            Idee
          </Link>
        }
      />
      <PageGuide title="Dinge, die ihr irgendwann ausprobieren wollt">
        Die Ideensammlung ist für noch offene Vorhaben gedacht. Eine Idee kann Beschreibung, Bilder und Bausteine enthalten, ohne schon ein konkreter Spieltermin oder Auftrag zu sein.
      </PageGuide>
      {ideas.length ? (
        <div className="space-y-3">
          {ideas.map((idea) => {
            const imageUrl = idea.images[0] ? fileAssetUrl(idea.images[0].fileId) : "";
            const likedByCurrentUser = idea.likes.some((like) => like.userId === user.id);
            const likePeople = idea.likes.map((like) => ({ id: like.userId, name: like.user ? userDisplayName(like.user) : "Jemand" }));
            return (
              <details key={idea.id} className="group/idea-card overflow-hidden rounded-lg border border-line bg-surface">
                <summary className="flex min-h-20 cursor-pointer list-none items-center gap-3 px-3 py-3 hover:bg-paper [&::-webkit-details-marker]:hidden">
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-paper sm:h-16 sm:w-16">
                    {imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center bg-amber-500/10 text-amber-600">
                        <Lightbulb className="h-6 w-6" />
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-base font-semibold text-ink">{idea.title}</h2>
                    <p className="mt-1 truncate text-xs text-graphite">
                      {toolsEnabled && idea.tools.length ? `${idea.tools.length} Spielsachen · ` : ""}
                      {positionsEnabled && idea.positions.length ? `${idea.positions.length} Szenen · ` : ""}
                      {idea.images.length} Bilder
                    </p>
                  </div>
                  <ChevronDown className="h-5 w-5 shrink-0 text-graphite transition group-open/idea-card:rotate-180" />
                </summary>
                <div className="border-t border-line bg-paper p-4">
                  <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
                    <div className="aspect-[4/3] overflow-hidden rounded-md bg-surface">
                      {imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={imageUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center bg-amber-500/10 text-amber-600">
                          <Lightbulb className="h-10 w-10" />
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-graphite">
                        <Badge tone={activityStatusTone(idea.status)}>{activityStatusDisplay(idea.status, false, true)}</Badge>
                        {toolsEnabled && idea.tools.length ? <span className="rounded-md bg-surface px-2 py-1">{idea.tools.length} Spielsachen</span> : null}
                        {positionsEnabled && idea.positions.length ? <span className="rounded-md bg-surface px-2 py-1">{idea.positions.length} Szenen</span> : null}
                      </div>
                      <p className="mt-4 text-sm leading-6 text-graphite">{idea.note || "Keine Beschreibung hinterlegt."}</p>
                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        <Link href={`/ideas/${idea.slug}`} className="inline-flex min-h-10 items-center rounded-md bg-redbrand px-4 py-2 text-sm font-semibold text-white hover:bg-redbrandHover">
                          Detail öffnen
                        </Link>
                        <span className="text-xs text-graphite">Detailseite mit Bildern und Bearbeitung.</span>
                      </div>
                      <div className="mt-4">
                        <LikeControl action={toggleIdeaLike} hiddenName="activityId" hiddenValue={idea.id} liked={likedByCurrentUser} likes={likePeople} />
                      </div>
                    </div>
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      ) : (
        <EmptyState title="Noch keine Ideen festgehalten">
          <Link href="/activities/new?template=idea" className="font-semibold text-redbrand">Erste Idee anlegen</Link>
        </EmptyState>
      )}
    </AppShell>
  );
}
