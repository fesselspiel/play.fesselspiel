import Link from "next/link";
import { redirect } from "next/navigation";
import { KeyRound } from "lucide-react";
import { SubmitButton } from "@/components/submit-button";
import { Field, inputClass, Panel } from "@/components/ui";
import { createPasswordReset, notifyPasswordReset } from "@/lib/password-reset";
import { sendTemplateEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

async function requestPasswordReset(formData: FormData) {
  "use server";
  const identifier = String(formData.get("identifier") || "").trim();
  const user = identifier
    ? await prisma.user.findFirst({
        where: {
          active: true,
          OR: [{ email: identifier.toLowerCase() }, { username: identifier }]
        },
        include: { profile: true }
      })
    : null;
  if (user && user.email && !user.email.endsWith("@local.fesselspiel")) {
    const reset = await createPasswordReset(user.id);
    await sendTemplateEmail({
      key: "password_reset",
      to: user.email,
      actorId: user.id,
      source: "password-reset",
      entityType: "user",
      entityId: user.id,
      variables: {
        userName: user.profile?.displayName || user.name || user.username || user.email,
        loginIdentifier: user.username || user.email,
        appUrl: env.appUrl,
        profileUrl: `${env.appUrl}/profile`,
        resetUrl: reset.resetUrl
      }
    });
    await notifyPasswordReset(user, reset);
  }
  redirect("/password/forgot?sent=1");
}

export default async function ForgotPasswordPage(props: { searchParams?: Promise<{ sent?: string }> }) {
  const searchParams = await props.searchParams;
  return (
    <main className="min-h-screen bg-canvas px-4 py-10 text-ink">
      <div className="mx-auto max-w-lg">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-md bg-redbrand text-white">
            <KeyRound className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-semibold">Passwort zurücksetzen</h1>
          <p className="mt-2 text-sm leading-6 text-graphite">Gib deine E-Mail-Adresse oder deinen Benutzernamen ein. Wenn ein passendes Konto existiert, senden wir einen Link.</p>
        </div>
        <Panel>
          {searchParams?.sent ? (
            <div className="space-y-4 text-sm leading-6 text-graphite">
              <p>Falls ein passendes Konto existiert, wurde eine E-Mail zum Zurücksetzen versendet.</p>
              <Link href="/login" className="focus-ring inline-flex min-h-10 items-center rounded-md bg-redbrand px-4 py-2 text-sm font-semibold text-white hover:bg-redbrandHover">
                Zum Login
              </Link>
            </div>
          ) : (
            <form action={requestPasswordReset} className="space-y-4">
              <Field label="E-Mail oder Benutzername"><input className={inputClass} name="identifier" autoComplete="username" required /></Field>
              <SubmitButton pendingLabel="Link wird vorbereitet...">Link senden</SubmitButton>
            </form>
          )}
        </Panel>
      </div>
    </main>
  );
}
