import { NextResponse } from "next/server";
import { logAction, userDisplayName } from "@/lib/audit";
import { clearSessionCookie, currentUser } from "@/lib/auth";

export async function POST() {
  const user = await currentUser();
  if (user) {
    await logAction({
      actorId: user.id,
      action: "logout",
      entityType: "user",
      entityId: user.id,
      title: `${userDisplayName(user)} hat sich abgemeldet`
    });
  }
  const response = NextResponse.redirect(new URL("/login", process.env.APP_URL || "http://localhost:8097"));
  clearSessionCookie(response);
  return response;
}
