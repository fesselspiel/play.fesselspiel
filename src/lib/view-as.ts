"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { logAction, userDisplayName } from "@/lib/audit";
import { createSessionToken, requireAdmin, SESSION_COOKIE, sessionCookieOptions, verifySessionToken } from "@/lib/auth";

async function currentCookieMaxAge() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = verifySessionToken(token);
  if (!session) return 60 * 60 * 12;
  return Math.max(60, Math.floor((session.exp - Date.now()) / 1000));
}

export async function returnToOwnView() {
  const admin = await requireAdmin();
  const maxAge = await currentCookieMaxAge();
  const token = createSessionToken(admin.id, maxAge > 60 * 60 * 12, undefined, undefined, admin.sessionRevision);
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(maxAge));
  await logAction({
    actorId: admin.id,
    action: "admin_view_own",
    entityType: "user",
    entityId: admin.id,
    title: `${userDisplayName(admin)} ist zur eigenen Ansicht zurückgekehrt`,
    href: "/settings/view-as"
  });
  redirect("/settings/view-as");
}
