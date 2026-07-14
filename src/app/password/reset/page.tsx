import bcrypt from "bcryptjs";
import Link from "next/link";
import { redirect } from "next/navigation";
import { KeyRound } from "lucide-react";
import { SubmitButton } from "@/components/submit-button";
import { Field, inputClass, Panel } from "@/components/ui";
import { findValidPasswordReset } from "@/lib/password-reset";
import { prisma } from "@/lib/prisma";
import { passwordPolicyError, passwordPolicyText } from "@/lib/password-policy";

async function resetPassword(formData: FormData) {
  "use server";
  const token = String(formData.get("token") || "");
  const password = String(formData.get("password") || "");
  const reset = await findValidPasswordReset(token);
  if (!reset) redirect("/password/reset?error=invalid");
  const passwordError = passwordPolicyError(password);
  if (passwordError) redirect(`/password/reset?token=${encodeURIComponent(token)}&error=${passwordError}`);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: reset.userId },
      data: {
        passwordHash: await bcrypt.hash(password, 12),
        active: true
      }
    }),
    prisma.passwordResetToken.update({
      where: { id: reset.id },
      data: { usedAt: new Date() }
    })
  ]);
  redirect("/login?reset=1");
}

function displayName(user: { profile?: { displayName?: string | null } | null; name?: string | null; username?: string | null; email: string }) {
  return user.profile?.displayName || user.name || user.username || user.email;
}

export default async function ResetPasswordPage(props: { searchParams?: Promise<{ token?: string; error?: string }> }) {
  const searchParams = await props.searchParams;
  const token = String(searchParams?.token || "");
  const reset = await findValidPasswordReset(token);
  const invalid = searchParams?.error === "invalid" || !reset;
  return (
    <main className="min-h-screen bg-canvas px-4 py-10 text-ink">
      <div className="mx-auto max-w-lg">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-md bg-redbrand text-white">
            <KeyRound className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-semibold">{invalid ? "Link nicht gültig" : "Neues Passwort setzen"}</h1>
          <p className="mt-2 text-sm leading-6 text-graphite">
            {invalid ? "Der Link ist abgelaufen oder wurde bereits verwendet." : `Hallo ${displayName(reset.user)}, setze jetzt dein neues Passwort.`}
          </p>
        </div>
        <Panel>
          {invalid ? (
            <div className="space-y-4 text-sm text-graphite">
              <p>Fordere bei Bedarf einen neuen Link an.</p>
              <Link href="/password/forgot" className="focus-ring inline-flex min-h-10 items-center rounded-md bg-redbrand px-4 py-2 text-sm font-semibold text-white hover:bg-redbrandHover">
                Neuen Link anfordern
              </Link>
            </div>
          ) : (
            <form action={resetPassword} className="space-y-4">
              <input type="hidden" name="token" value={token} />
              <Field label="Konto"><input className={inputClass} value={reset.user.username || reset.user.email} readOnly /></Field>
              <Field label="Neues Passwort"><input className={inputClass} name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></Field>
              <p className="text-xs text-graphite">{passwordPolicyText()}</p>
              {searchParams?.error?.startsWith("password_") ? <p className="text-sm font-semibold text-redbrand">Das Passwort muss zwischen 12 und 128 Zeichen lang sein.</p> : null}
              <SubmitButton pendingLabel="Passwort wird gespeichert...">Passwort speichern</SubmitButton>
            </form>
          )}
        </Panel>
      </div>
    </main>
  );
}
