import { NextResponse } from "next/server";
import { z } from "zod";
import { login, setSessionCookie } from "@/lib/auth";

const LoginSchema = z.object({
  identifier: z.string().min(1),
  password: z.string().min(1),
  remember: z.boolean().optional()
});

export async function POST(request: Request) {
  const parsed = LoginSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Ungueltige Eingabe" }, { status: 400 });
  const result = await login(parsed.data.identifier, parsed.data.password, Boolean(parsed.data.remember));
  if (!result) return NextResponse.json({ error: "Login fehlgeschlagen" }, { status: 401 });
  const response = NextResponse.json({ ok: true });
  setSessionCookie(response, result.token, Boolean(parsed.data.remember));
  return response;
}
