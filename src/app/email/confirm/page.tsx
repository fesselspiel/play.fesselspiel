import bcrypt from "bcryptjs";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, KeyRound } from "lucide-react";
import { SubmitButton } from "@/components/submit-button";
import { Field, inputClass, Panel } from "@/components/ui";
import { findValidEmailConfirmation } from "@/lib/email-confirmation";
import { prisma } from "@/lib/prisma";
import { passwordPolicyError, passwordPolicyText } from "@/lib/password-policy";

async function confirmEmail(formData: FormData) {
  "use server";
  const token = String(formData.get("token") || "");
  const password = String(formData.get("password") || "");
  const confirmation = await findValidEmailConfirmation(token);
  if (!confirmation) redirect("/email/confirm?error=invalid");
  if (confirmation.email && confirmation.email !== confirmation.user.email) redirect("/email/confirm?error=invalid");
  const passwordError = passwordPolicyError(password);
  if (passwordError) redirect(`/email/confirm?token=${encodeURIComponent(token)}&error=${passwordError}`);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: confirmation.userId },
      data: {
        passwordHash: await bcrypt.hash(password, 12),
        emailVerifiedAt: new Date(),
        active: true
      }
    }),
    prisma.emailConfirmationToken.update({
      where: { id: confirmation.id },
      data: { usedAt: new Date() }
    })
  ]);
  redirect("/login?confirmed=1");
}

function displayName(user: { profile?: { displayName?: string | null } | null; name?: string | null; username?: string | null; email: string }) {
  return user.profile?.displayName || user.name || user.username || user.email;
}

export default async function ConfirmEmailPage(props: { searchParams?: Promise<{ token?: string; error?: string }> }) {
  const searchParams = await props.searchParams;
  const token = String(searchParams?.token || "");
  const confirmation = await findValidEmailConfirmation(token);
  const invalid = searchParams?.error === "invalid" || !confirmation || Boolean(confirmation.email && confirmation.email !== confirmation.user.email);
  return (
    <main className="min-h-screen bg-canvas px-4 py-10 text-ink">
      <div className="mx-auto max-w-lg">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-md bg-redbrand text-white">
            {invalid ? <KeyRound className="h-7 w-7" /> : <CheckCircle2 className="h-7 w-7" />}
          </div>
          <h1 className="text-2xl font-semibold">{invalid ? "Link nicht gültig" : "Zugang bestätigen"}</h1>
          <p className="mt-2 text-sm leading-6 text-graphite">
            {invalid ? "Der Bestätigungslink ist abgelaufen oder wurde bereits verwendet." : `Hallo ${displayName(confirmation.user)}, setze dein Passwort und bestätige deine E-Mail-Adresse.`}
          </p>
        </div>
        <Panel>
          {invalid ? (
            <div className="space-y-4 text-sm text-graphite">
              <p>Bitte fordere einen neuen Einladungslink beim Admin an.</p>
              <Link href="/login" className="focus-ring inline-flex min-h-10 items-center rounded-md bg-redbrand px-4 py-2 text-sm font-semibold text-white hover:bg-redbrandHover">
                Zum Login
              </Link>
            </div>
          ) : (
            <form action={confirmEmail} className="space-y-4">
              <input type="hidden" name="token" value={token} />
              <Field label="E-Mail"><input className={inputClass} value={confirmation.user.email} readOnly /></Field>
              <Field label="Passwort setzen"><input className={inputClass} name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></Field>
              <p className="text-xs text-graphite">{passwordPolicyText()}</p>
              {searchParams?.error?.startsWith("password_") ? <p className="text-sm font-semibold text-redbrand">Das Passwort muss zwischen 12 und 128 Zeichen lang sein.</p> : null}
              <SubmitButton pendingLabel="Zugang wird bestätigt...">Zugang bestätigen</SubmitButton>
            </form>
          )}
        </Panel>
      </div>
    </main>
  );
}
