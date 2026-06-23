import { redirect } from "next/navigation";
import { Clock, KeyRound, Plus, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge, Button, Field, inputClass, PageGuide, PageHeader, Panel } from "@/components/ui";
import { createApiToken } from "@/lib/api-tokens";
import { currentUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { requireFeature } from "@/lib/features";
import { prisma } from "@/lib/prisma";

type ApiSearchParams = {
  token?: string;
  created?: string;
};

async function addToken(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  await requireFeature("externalApi");
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") redirect("/");
  const { token, record } = await createApiToken(user.id, String(formData.get("name") || ""));
  const params = new URLSearchParams({ created: record.tokenLastSix, token });
  redirect(`/settings/api?${params.toString()}`);
}

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

export default async function ApiSettingsPage({ searchParams }: { searchParams: ApiSearchParams }) {
  await requireFeature("externalApi");
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") redirect("/");
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
            Für Alexa-Webaufrufe kannst du den Token als `?token=...` anhaengen. Für Apps ist `Authorization: Bearer ...` sauberer.
          </div>
        </Panel>

        <div className="space-y-6">
          <Panel>
            <h2 className="mb-4 text-lg font-semibold">Aktive Endpunkte</h2>
            <div className="space-y-3 text-sm">
              {[
                ["GET", "/api/external/status?token=...", "Status, Benutzer und Grunddaten prüfen."],
                ["GET", "/api/external/play-ready?token=...", "Aktuellen Spielampelstatus abfragen."],
                ["GET", "/api/external/play-ready?token=...&state=green&hours=2&minutes=15", "Spielampel setzen. `state` kann green, red oder toggle sein; Dauer maximal 12 Stunden."],
                ["GET", "/api/external/invites?token=...", "Einladungskontingent abfragen."],
                ["GET", "/api/external/invites?token=...&create=1&name=Anna&email=...", "Einladungslink erzeugen; Admins haben unbegrenzt Einladungen."],
                ["GET", "/api/external/trackers/quotas?token=...", "Kontingente und offene Tracker-Todos abfragen."],
                ["GET", "/api/external/trackers/{trackerKey}/start?token=...&note=...&title=...", "Beliebigen Tracker starten, z. B. trackerKey=segufix oder kg."],
                ["GET", "/api/external/trackers/{trackerKey}/stop?token=...&note=...", "Beliebigen laufenden Tracker beenden."],
                ["GET", "/api/external/sessions/start?token=...&note=...", "Legacy-Segufix starten."],
                ["GET", "/api/external/sessions/stop?token=...&note=...", "Legacy-Segufix beenden."],
                ["GET", "/api/external/sessions/toggle?token=...&note=...", "Legacy-Segufix umschalten."],
                ["GET", "/api/external/kg/start?token=...&note=...", "Legacy-KG starten."],
                ["GET", "/api/external/kg/stop?token=...&note=...", "Legacy-KG beenden."],
                ["POST", "/api/external/media", "Bild/Video per Multipart hochladen. Token im Header oder als Feld `token`."]
              ].map(([method, endpoint, description]) => (
                <div key={endpoint} className="rounded-md bg-paper p-3">
                  <div className="font-semibold text-ink">{method}</div>
                  <code className="mt-1 block overflow-x-auto text-xs text-ink">{endpoint}</code>
                  <p className="mt-2 text-xs text-graphite">{description}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-md bg-paper p-3 text-sm leading-6 text-graphite">
              Variablen: <code>{"{trackerKey}"}</code> ist der technische Tracker-Schlüssel. Häufige URL-Parameter sind <code>token</code>, <code>note</code>, <code>title</code>, <code>startTime</code>, <code>endTime</code>, <code>state</code>, <code>hours</code>, <code>minutes</code> und <code>expiresMinutes</code>, sofern der jeweilige Endpunkt sie unterstützt.
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
