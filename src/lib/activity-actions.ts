import { notFound, redirect } from "next/navigation";
import { ownerScope } from "@/lib/access";
import { logAction } from "@/lib/audit";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function confirmRequestedActivity(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id") || "");
  const activity = await prisma.activityPlan.findFirst({ where: { id, ...(await ownerScope(user)), status: "REQUESTED", ownerId: { not: user.id } } });
  if (!activity) notFound();
  const updated = await prisma.activityPlan.update({ where: { id: activity.id }, data: { status: "PLANNED" } });
  await logAction({
    actorId: user.id,
    action: "activity_confirmed",
    entityType: "activity",
    entityId: updated.id,
    title: `Spielplan bestätigt: ${updated.title}`,
    href: `/activities/${updated.slug}`
  });
  redirect(`/activities/${updated.slug}`);
}
