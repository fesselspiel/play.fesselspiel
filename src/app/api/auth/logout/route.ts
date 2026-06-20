import { NextResponse } from "next/server";
import { logAction, userDisplayName } from "@/lib/audit";
import { clearSessionCookie, currentUser } from "@/lib/auth";

export async function POST(request: Request) {
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
  const response = NextResponse.redirect(new URL("/login", request.url), { status: 303 });
  clearSessionCookie(response);
  return response;
}
