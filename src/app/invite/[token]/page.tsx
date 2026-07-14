import Link from "next/link";
import { redirect } from "next/navigation";
import { KeyRound, UserPlus } from "lucide-react";
import { SubmitButton } from "@/components/submit-button";
import { Field, inputClass, Panel } from "@/components/ui";
import { acceptInvite, findValidInvite } from "@/lib/invites";
import { headers } from "next/headers";
import { passwordPolicyText } from "@/lib/password-policy";
import { clientAddressFromHeaders, consumeRateLimit, securitySubjectHash } from "@/lib/security-rate-limit";

const INVITE_TOKEN = { scope: "invite-accept-token", limit: 10, windowMs: 60 * 60_000, blockMs: 60 * 60_000 };
const INVITE_ADDRESS = { scope: "invite-accept-address", limit: 30, windowMs: 60 * 60_000, blockMs: 60 * 60_000 };

async function acceptInviteAction(formData: FormData) {
  "use server";
  const token = String(formData.get("token") || "");
  const requestHeaders = await headers();
  const host = requestHeaders.get("host")?.toLowerCase() || "unknown";
  const [tokenLimit, addressLimit] = await Promise.all([
    consumeRateLimit(INVITE_TOKEN, `${host}:${securitySubjectHash(token)}`),
    consumeRateLimit(INVITE_ADDRESS, `${host}:${clientAddressFromHeaders(requestHeaders)}`)
  ]);
  if (!tokenLimit.allowed || !addressLimit.allowed) redirect(`/invite/${encodeURIComponent(token)}?error=rate_limited`);
  const result = await acceptInvite({
    token,
    name: String(formData.get("name") || ""),
    email: String(formData.get("email") || ""),
    username: String(formData.get("username") || ""),
    password: String(formData.get("password") || "")
  });
  if (!result.ok) redirect(`/invite/${encodeURIComponent(token)}?error=${encodeURIComponent(result.error)}`);
  redirect("/login?confirmed=1");
}

function errorText(error?: string) {
  if (error === "email_exists") return "Diese E-Mail-Adresse ist bereits vergeben.";
  if (error === "username_exists") return "Dieser Benutzername ist bereits vergeben.";
  if (error === "email_mismatch") return "Diese Einladung ist an eine andere E-Mail-Adresse gebunden.";
  if (error === "missing") return "Bitte fülle alle Pflichtfelder aus.";
  if (error === "password_too_short" || error === "password_too_long") return "Das Passwort muss zwischen 12 und 128 Zeichen lang sein.";
  if (error === "rate_limited") return "Zu viele Versuche. Bitte probiere es später erneut.";
  return "Die Einladung konnte nicht angenommen werden.";
}

export default async function InviteAcceptPage(
  props: { params: Promise<{ token: string }>; searchParams?: Promise<{ error?: string }> }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const invite = await findValidInvite(params.token);
  const invalid = !invite;
  return (
    <main className="min-h-screen bg-canvas px-4 py-10 text-ink">
      <div className="mx-auto max-w-lg">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-md bg-redbrand text-white">
            {invalid ? <KeyRound className="h-7 w-7" /> : <UserPlus className="h-7 w-7" />}
          </div>
          <h1 className="text-2xl font-semibold">{invalid ? "Einladung nicht gültig" : "Einladung annehmen"}</h1>
          <p className="mt-2 text-sm leading-6 text-graphite">
            {invalid
              ? "Der Einladungslink ist abgelaufen, widerrufen oder wurde bereits verwendet."
              : `Du wurdest zu ${invite.tenant.name} eingeladen.`}
          </p>
        </div>
        <Panel>
          {invalid ? (
            <div className="space-y-4 text-sm text-graphite">
              <p>Bitte fordere einen neuen Einladungslink an.</p>
              <Link href="/login" className="focus-ring inline-flex min-h-10 items-center rounded-md bg-redbrand px-4 py-2 text-sm font-semibold text-white hover:bg-redbrandHover">
                Zum Login
              </Link>
            </div>
          ) : (
            <form action={acceptInviteAction} className="space-y-4">
              <input type="hidden" name="token" value={params.token} />
              {searchParams?.error ? <p className="rounded-md bg-redbrand/10 p-3 text-sm font-semibold text-redbrand">{errorText(searchParams.error)}</p> : null}
              <Field label="Name"><input className={inputClass} name="name" required defaultValue={invite.name || ""} /></Field>
              <Field label="E-Mail"><input className={inputClass} name="email" type="email" required readOnly={Boolean(invite.email)} defaultValue={invite.email || ""} /></Field>
              <Field label="Benutzername"><input className={inputClass} name="username" placeholder="optional" /></Field>
              <Field label="Passwort"><input className={inputClass} name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></Field>
              <p className="text-xs text-graphite">{passwordPolicyText()}</p>
              <SubmitButton pendingLabel="Zugang wird erstellt...">Zugang erstellen</SubmitButton>
            </form>
          )}
        </Panel>
      </div>
    </main>
  );
}
