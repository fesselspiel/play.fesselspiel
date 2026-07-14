import { redirect } from "next/navigation";
import { Clock, KeyRound, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ApiTokenCreateForm } from "@/components/api-token-create-form";
import { Badge, Button, PageGuide, PageHeader, Panel } from "@/components/ui";
import { currentUser } from "@/lib/auth";
import { apiEndpointSpecs, apiVariableNames } from "@/lib/capabilities";
import { formatDateTime } from "@/lib/dates";
import { requireFeature } from "@/lib/features";
import { prisma } from "@/lib/prisma";

async function revokeToken(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  await requireFeature("externalApi");
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") redirect("/");
  const id = String(formData.get("id") || "");
  await prisma.apiToken.updateMany({ where: { id, userId: user.id }, data: { active: false } });
  redirect("/settings/api");
}

async function deleteToken(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  await requireFeature("externalApi");
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") redirect("/");
  const id = String(formData.get("id") || "");
  await prisma.apiToken.deleteMany({ where: { id, userId: user.id, active: false } });
  redirect("/settings/api");
}

export default async function ApiSettingsPage() {
  await requireFeature("externalApi");
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") redirect("/");
  const tokens = await prisma.apiToken.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });

  return (
    <AppShell>
      <PageHeader title="API Tokens" />
      <PageGuide title="Externe Zugriffe mit Bearer Token">
        API Tokens erlauben externen Systemen wie Kurzbefehlen oder anderen Apps gezielte Aktionen im Portal. Sie werden ausschließlich im Authorization-Header übertragen.
      </PageGuide>

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <Panel>
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold"><KeyRound className="h-5 w-5 text-redbrand" /> Token erzeugen</h2>
          <ApiTokenCreateForm />
          <div className="mt-4 rounded-md bg-paper p-3 text-sm leading-6 text-graphite">
            Der Token ist nur einmal sichtbar. Übertrage ihn als <code>Authorization: Bearer …</code> und nie als URL-Parameter.
          </div>
        </Panel>

        <div className="space-y-6">
          <Panel>
            <h2 className="mb-4 text-lg font-semibold">Aktive Endpunkte</h2>
            <div className="space-y-3 text-sm">
              {apiEndpointSpecs.map((endpoint) => (
                <div key={`${endpoint.method}-${endpoint.path}`} className="rounded-md bg-paper p-3">
                  <div className="font-semibold text-ink">{endpoint.method}</div>
                  <code className="mt-1 block overflow-x-auto text-xs text-ink">{endpoint.path}</code>
                  <p className="mt-2 text-xs text-graphite">{endpoint.description}</p>
                  <p className="mt-1 text-[11px] text-graphite">{endpoint.capability} · {endpoint.action}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-md bg-paper p-3 text-sm leading-6 text-graphite">
              Variablen: <code>{"{trackerKey}"}</code> ist der technische Tracker-Schlüssel. Häufige URL-Parameter sind {apiVariableNames.map((name, index) => (
                <span key={name}>{index ? ", " : ""}<code>{name}</code></span>
              ))}, sofern der jeweilige Endpunkt sie unterstützt.
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
                  ) : (
                    <form action={deleteToken}>
                      <input type="hidden" name="id" value={entry.id} />
                      <Button variant="danger"><Trash2 className="h-4 w-4" /> Löschen</Button>
                    </form>
                  )}
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
