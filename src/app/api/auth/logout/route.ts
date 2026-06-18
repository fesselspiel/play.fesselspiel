import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth";

export async function POST() {
  const response = NextResponse.redirect(new URL("/login", process.env.APP_URL || "http://localhost:8097"));
  clearSessionCookie(response);
  return response;
}
