import { redirect } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { CircleChatClient } from "@/components/circle-chat-client";
import { PageGuide, PageHeader, Panel } from "@/components/ui";
import { currentUser } from "@/lib/auth";
import { circleChatMembers, requireCircleChatScope, serializeCircleChatMessage } from "@/lib/circle-chat";
import { requireFeature } from "@/lib/features";
import { prisma } from "@/lib/prisma";
import { userDisplayName } from "@/lib/audit";

export const dynamic = "force-dynamic";

export default async function CircleChatPage() {
  await requireFeature("circleChat");
  const user = await currentUser();
  if (!user) redirect("/login");
  const scope = await requireCircleChatScope(user).catch(() => null);
  if (!scope) {
    return (
      <>
        <PageHeader
          title="Chat"
          subtitle={
            <span className="inline-flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-redbrand" />
              Echtzeit-Chat für deinen Zirkel.
            </span>
          }
        />
        <Panel>
          <h2 className="text-lg font-semibold text-ink">Kein Zirkel zugeordnet</h2>
          <p className="mt-2 text-sm leading-6 text-graphite">
            Diese Benutzeransicht ist aktuell keinem Zirkel zugeordnet. Der Chat wird sichtbar, sobald der Benutzer in der Benutzerverwaltung einem Zirkel zugeordnet ist.
          </p>
        </Panel>
      </>
    );
  }
  const [messages, members] = await Promise.all([
    prisma.circleChatMessage.findMany({
      where: { tenantId: scope.tenantId, circleId: scope.circleId, deletedAt: null },
      include: { sender: { include: { profile: true } }, file: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 50
    }),
    circleChatMembers(scope.tenantId, scope.circleId)
  ]);

  return (
    <>
      <PageHeader
        title="Chat"
        subtitle={
          <span className="inline-flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-redbrand" />
            Echtzeit-Chat für deinen Zirkel.
          </span>
        }
      />
      <CircleChatClient
        initialMessages={messages.reverse().map((message) => serializeCircleChatMessage(message, user.id))}
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
