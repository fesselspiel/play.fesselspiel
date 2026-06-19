import { redirect } from "next/navigation";
import { Clock, KeyRound, Plus, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge, Button, Field, inputClass, PageGuide, PageHeader, Panel } from "@/components/ui";
import { createApiToken } from "@/lib/api-tokens";
import { currentUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

type ApiSearchParams = {
  token?: string;
  created?: string;
};

async function addToken(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  const { token, record } = await createApiToken(user.id, String(formData.get("name") || ""));
  const params = new URLSearchParams({ created: record.tokenLastSix, token });
  redirect(`/settings/api?${params.toString()}`);
}

async function revokeToken(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id") || "");
  await prisma.apiToken.updateMany({ where: { id, userId: user.id }, data: { active: false } });
  redirect("/settings/api");
}

export default async function ApiSettingsPage({ searchParams }: { searchParams: ApiSearchParams }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const tokens = await prisma.apiToken.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });

  return (
    <AppShell>
      <PageHeader title="API Tokens" />
      <PageGuide title="Externe Zugriffe mit Bearer Token oder URL-Token">
        API Tokens erlauben externen Systemen wie Alexa, Kurzbefehlen oder anderen Apps gezielte Aktionen im Portal. Der Token kann im Header als Bearer Token oder als URL-Parameter `token` verwendet werden.
      </PageGuide>

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <Panel>
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold"><KeyRound className="h-5 w-5 text-redbrand" /> Token erzeugen</h2>
          {searchParams.token ? (
            <div className="mb-4 rounded-md border border-redbrand bg-redbrand/10 p-3 text-sm">
              <div className="font-semibold text-ink">Neuer Token, nur jetzt sichtbar</div>
              <code className="mt-2 block overflow-x-auto rounded-md bg-surface p-2 text-xs text-ink">{searchParams.token}</code>
              <p className="mt-2 text-graphite">Endet auf ...{searchParams.created}</p>
            </div>
          ) : null}
          <form action={addToken} className="space-y-4">
            <Field label="Name">
              <input className={inputClass} name="name" placeholder="Alexa Sessionsteuerung" required />
            </Field>
            <Button><Plus className="h-4 w-4" /> Token erzeugen</Button>
          </form>
          <div className="mt-4 rounded-md bg-paper p-3 text-sm leading-6 text-graphite">
            Fuer Alexa-Webaufrufe kannst du den Token als `?token=...` anhaengen. Fuer Apps ist `Authorization: Bearer ...` sauberer.
          </div>
        </Panel>

        <div className="space-y-6">
          <Panel>
            <h2 className="mb-4 text-lg font-semibold">Aktive Endpunkte</h2>
            <div className="space-y-3 text-sm">
              <code className="block rounded-md bg-paper p-3">GET /api/external/status?token=...</code>
              <code className="block rounded-md bg-paper p-3">GET /api/external/sessions/start?token=...&note=Alexa</code>
              <code className="block rounded-md bg-paper p-3">GET /api/external/sessions/stop?token=...</code>
              <code className="block rounded-md bg-paper p-3">GET /api/external/sessions/toggle?token=...</code>
              <code className="block rounded-md bg-paper p-3">POST /api/external/media</code>
            </div>
          </Panel>

          <Panel>
            <h2 className="mb-4 text-lg font-semibold">Gespeicherte Tokens</h2>
            <div className="space-y-3">
              {tokens.map((entry) => (
                <div key={entry.id} className="grid gap-3 rounded-md border border-line bg-paper p-3 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <strong>{entry.name}</strong>
                      <Badge tone={entry.active ? "green" : "neutral"}>{entry.active ? "aktiv" : "deaktiviert"}</Badge>
                    </div>
                    <div className="mt-1 text-sm text-graphite">endet auf ...{entry.tokenLastSix}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-graphite">
                      <Clock className="h-3.5 w-3.5" />
                      erstellt {formatDateTime(entry.createdAt)}
                      {entry.lastUsedAt ? ` · zuletzt genutzt ${formatDateTime(entry.lastUsedAt)}` : ""}
                    </div>
                  </div>
                  {entry.active ? (
                    <form action={revokeToken}>
                      <input type="hidden" name="id" value={entry.id} />
                      <Button variant="danger"><Trash2 className="h-4 w-4" /> Deaktivieren</Button>
                    </form>
                  ) : null}
                </div>
              ))}
              {!tokens.length ? <p className="text-sm text-graphite">Noch keine API Tokens angelegt.</p> : null}
            </div>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
