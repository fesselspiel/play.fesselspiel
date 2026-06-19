import { notFound, redirect } from "next/navigation";
import { logAction } from "@/lib/audit";
import { currentUser } from "@/lib/auth";
import { minutesBetween } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { ensureSessionSlug } from "@/lib/session-slug";

export async function stopSegufixSession(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id") || "");
  const session = await prisma.segufixSession.findFirst({ where: { id, ownerId: user.id, endTime: null } });
  if (!session) notFound();
  const endTime = new Date();
  const updated = await prisma.segufixSession.update({
    where: { id: session.id },
    data: {
      endTime,
      durationMinutes: minutesBetween(session.startTime, endTime)
    }
  });
  const slug = await ensureSessionSlug(updated);
  await logAction({
    actorId: user.id,
    action: "session_stopped",
    entityType: "session",
    entityId: updated.id,
    title: "Session beendet",
    href: `/sessions/${slug}`
  });
  redirect(`/sessions/${slug}`);
}
