import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { currentSessionContext } from "@/lib/auth";
import { clientDisplayName, isAllowedChatGptRedirect, isChatGptClientUrl, normalizeScopes } from "@/lib/oauth";
import { prisma } from "@/lib/prisma";

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function OAuthAuthorizePage({ searchParams }: Props) {
  const params = (await searchParams) || {};
  const clientId = first(params.client_id) || "";
  const redirectUri = first(params.redirect_uri) || "";
  const responseType = first(params.response_type) || "";
  const scope = first(params.scope) || "";
  const state = first(params.state) || "";
  const codeChallenge = first(params.code_challenge) || "";
  const codeChallengeMethod = first(params.code_challenge_method) || "";
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") || headerList.get("host") || "playplaner.com";
  const proto = headerList.get("x-forwarded-proto") || "https";
  const expectedResource = `${proto}://${host}/mcp`;
  const resource = first(params.resource) || expectedResource;
  const currentPath = `/oauth/authorize?${new URLSearchParams(Object.entries(params).flatMap(([key, value]) => {
    if (Array.isArray(value)) return value.map((item) => [key, item]);
    return value === undefined ? [] : [[key, value]];
  })).toString()}`;
  const { actor, tenant } = await currentSessionContext();
  if (!actor) redirect(`/login?next=${encodeURIComponent(currentPath)}`);

  let client = await prisma.oAuthClient.findUnique({ where: { clientId } });
  if (!client && isChatGptClientUrl(clientId) && isAllowedChatGptRedirect(redirectUri)) {
    client = await prisma.oAuthClient.create({
      data: {
        clientId,
        clientName: "ChatGPT",
        redirectUris: [redirectUri],
        grantTypes: ["authorization_code"],
        responseTypes: ["code"],
        tokenEndpointAuthMethod: "none"
      }
    });
  }
  const redirectUris = Array.isArray(client?.redirectUris) ? client.redirectUris.map(String) : [];
  const invalid =
    !client ||
    responseType !== "code" ||
    !redirectUris.includes(redirectUri) ||
    !codeChallenge ||
    codeChallengeMethod !== "S256" ||
    resource !== expectedResource;
  const scopes = normalizeScopes(scope);
  const authorizedClient = client;

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-10">
      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
        <p className="text-sm font-semibold text-[var(--primary)]">Playplaner OAuth</p>
        <h1 className="mt-2 text-3xl font-bold text-[var(--text)]">Zugriff bestaetigen</h1>
        {invalid ? (
          <div className="mt-6 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            Die OAuth-Anfrage ist ungueltig oder der Client ist nicht registriert.
          </div>
        ) : (
          <>
            <p className="mt-4 text-[var(--muted)]">
              <strong>{clientDisplayName(authorizedClient!.clientName, authorizedClient!.clientId)}</strong> moechte Playplaner ueber die MCP-Schnittstelle verwenden.
            </p>
            <dl className="mt-5 space-y-2 text-sm text-[var(--muted)]">
              <div>
                <dt className="font-semibold text-[var(--text)]">Benutzer</dt>
                <dd>{actor.name || actor.username || actor.email}</dd>
              </div>
              <div>
                <dt className="font-semibold text-[var(--text)]">Seite</dt>
                <dd>{tenant?.name || actor.tenant?.name || "Playplaner"}</dd>
              </div>
              <div>
                <dt className="font-semibold text-[var(--text)]">Scopes</dt>
                <dd>{scopes.join(" ")}</dd>
              </div>
            </dl>
            <form method="post" action="/oauth/authorize/confirm" className="mt-6 flex flex-wrap gap-3">
              <input type="hidden" name="client_id" value={clientId} />
              <input type="hidden" name="redirect_uri" value={redirectUri} />
              <input type="hidden" name="response_type" value={responseType} />
              <input type="hidden" name="scope" value={scopes.join(" ")} />
              <input type="hidden" name="state" value={state} />
              <input type="hidden" name="code_challenge" value={codeChallenge} />
              <input type="hidden" name="code_challenge_method" value={codeChallengeMethod} />
              <input type="hidden" name="resource" value={resource} />
              <button className="btn btn-primary" type="submit">Zugriff erlauben</button>
              <a className="btn btn-secondary" href="/">Abbrechen</a>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
