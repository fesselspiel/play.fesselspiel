import Link from "next/link";
import { redirect } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { CircleChatClient } from "@/components/circle-chat-client";
import { PageGuide, Panel } from "@/components/ui";
import { currentUser } from "@/lib/auth";
import { accessibleCircleChats, circleChatMembers, requireCircleChatScope, serializeCircleChatMessage } from "@/lib/circle-chat";
import { requireFeature } from "@/lib/features";
import { prisma } from "@/lib/prisma";
import { userDisplayName } from "@/lib/audit";

export const dynamic = "force-dynamic";

function ChatHeader() {
  return (
    <section className="mb-4 rounded-lg border border-line bg-surface p-5 shadow-soft">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-ink sm:text-3xl">
            <MessageCircle className="h-6 w-6 text-redbrand" />
            Chat
          </h1>
          <p className="mt-1 text-sm leading-6 text-graphite">Echtzeit-Chat für deinen Zirkel.</p>
        </div>
        <Link
          href="/"
          className="inline-flex min-h-10 items-center justify-center rounded-md border border-line bg-paper px-4 py-2 text-sm font-semibold text-ink transition hover:bg-surface"
        >
          Chat verlassen
        </Link>
      </div>
    </section>
  );
}

export default async function CircleChatPage({ searchParams }: { searchParams?: { circleId?: string } }) {
  await requireFeature("circleChat");
  const user = await currentUser();
  if (!user) redirect("/login");
  const requestedCircleId = typeof searchParams?.circleId === "string" ? searchParams.circleId : null;
  const scope = await requireCircleChatScope(user, requestedCircleId).catch(() => null);
  if (!scope) {
    return (
      <>
        <ChatHeader />
        <Panel>
          <h2 className="text-lg font-semibold text-ink">Kein Zirkel zugeordnet</h2>
          <p className="mt-2 text-sm leading-6 text-graphite">
            Diese Benutzeransicht ist aktuell keinem Zirkel zugeordnet. Der Chat wird sichtbar, sobald der Benutzer in der Benutzerverwaltung einem Zirkel zugeordnet ist.
          </p>
        </Panel>
      </>
    );
  }
  const [messages, members, circles] = await Promise.all([
    prisma.circleChatMessage.findMany({
      where: { tenantId: scope.tenantId, circleId: scope.circleId, deletedAt: null },
      include: { sender: { include: { profile: true } }, file: true, receipts: { include: { user: { include: { profile: true } } } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 50
    }),
    circleChatMembers(scope.tenantId, scope.circleId),
    accessibleCircleChats(user)
  ]);

  return (
    <>
      <ChatHeader />
      <CircleChatClient
        key={scope.circleId}
        circleId={scope.circleId}
        circleName={scope.circleName}
        circles={circles.map((circle) => ({
          id: circle.id,
          name: circle.name,
          memberCount: circle.memberCount,
          unreadCount: circle.unreadCount,
          selected: circle.id === scope.circleId,
          lastMessage: circle.lastMessage
        }))}
        initialMessages={messages.reverse().map((message) => serializeCircleChatMessage(message, user.id, user.role))}
        members={members.map((member) => ({
          id: member.id,
          name: userDisplayName(member),
          imageUrl: member.profile?.imageUrl || null
        }))}
      />
      <PageGuide title="Chat">
        Schreibe Nachrichten direkt an deinen Zirkel. Bilder und Videos werden geschützt gespeichert und sind nur für berechtigte Mitglieder sichtbar. Neue Nachrichten erscheinen automatisch, ohne dass du die Seite neu laden musst.
      </PageGuide>
    </>
  );
}
