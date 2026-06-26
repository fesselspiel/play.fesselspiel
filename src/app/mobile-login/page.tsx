import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { CheckCircle2, KeyRound, Smartphone } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, Panel } from "@/components/ui";
import { currentUser } from "@/lib/auth";
import { createApiToken } from "@/lib/api-tokens";
import { requireFeature } from "@/lib/features";

export const dynamic = "force-dynamic";

type MobileLoginSearchParams = {
  callback?: string;
  state?: string;
  device?: string;
};

function safeCallback(raw: string | undefined) {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "playplaner:") return null;
    if (url.hostname !== "auth") return null;
    return url;
  } catch {
    return null;
  }
}

function currentBaseUrl() {
  const headerStore = headers();
  const host = headerStore.get("x-forwarded-host") || headerStore.get("host") || "playplaner.com";
  const proto = headerStore.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

function mobileLoginPath(params: MobileLoginSearchParams) {
  const query = new URLSearchParams();
  if (params.callback) query.set("callback", params.callback);
  if (params.state) query.set("state", params.state);
  if (params.device) query.set("device", params.device);
  const suffix = query.toString();
  return `/mobile-login${suffix ? `?${suffix}` : ""}`;
}

async function connectMobileApp(formData: FormData) {
  "use server";

  const user = await currentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent("/mobile-login")}`);
  await requireFeature("externalApi");

  const callback = safeCallback(String(formData.get("callback") || ""));
  const state = String(formData.get("state") || "").trim();
  if (!callback || !state) redirect("/mobile-login?error=callback");

  const device = String(formData.get("device") || "").trim().slice(0, 60) || "iPhone App";
  const baseUrl = String(formData.get("baseUrl") || "").trim() || currentBaseUrl();
  const { token } = await createApiToken(user.id, `Mobile App: ${device}`);

  callback.searchParams.set("token", token);
  callback.searchParams.set("baseUrl", baseUrl);
  callback.searchParams.set("state", state);
  callback.searchParams.set("user", user.profile?.displayName || user.name || user.username || user.email);
  redirect(callback.toString());
}

export default async function MobileLoginPage({ searchParams }: { searchParams: MobileLoginSearchParams }) {
  const callback = safeCallback(searchParams.callback);
  const state = String(searchParams.state || "").trim();
  const device = String(searchParams.device || "iPhone").trim().slice(0, 60) || "iPhone";

  if (!callback || !state) {
    return (
      <main className="min-h-screen bg-canvas px-5 py-10 text-ink">
        <Panel className="mx-auto max-w-lg">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-md bg-redbrand text-white">
            <Smartphone className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-semibold">App-Verbindung unvollständig</h1>
          <p className="mt-3 text-sm leading-6 text-graphite">
            Öffne die Verbindung bitte direkt aus der iPhone- oder iPad-App heraus.
          </p>
        </Panel>
      </main>
    );
  }

  const user = await currentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(mobileLoginPath(searchParams))}`);
  await requireFeature("externalApi");

  const baseUrl = currentBaseUrl();
  const displayName = user.profile?.displayName || user.name || user.username || user.email;

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl">
        <Panel>
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-md bg-redbrand text-white">
              <Smartphone className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-ink">App verbinden</h1>
              <p className="text-sm text-graphite">{device} mit deinem Playplaner-Konto verbinden.</p>
            </div>
          </div>

          <div className="mb-6 rounded-lg border border-line bg-paper p-4 text-sm leading-6 text-graphite">
            <div className="mb-2 flex items-center gap-2 font-semibold text-ink">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              Angemeldet als {displayName}
            </div>
            Die App bekommt einen eigenen Zugang, den du später in der API-Verwaltung wieder deaktivieren kannst.
          </div>

          <form action={connectMobileApp}>
            <input type="hidden" name="callback" value={callback.toString()} />
            <input type="hidden" name="state" value={state} />
            <input type="hidden" name="device" value={device} />
            <input type="hidden" name="baseUrl" value={baseUrl} />
            <Button className="w-full">
              <KeyRound className="h-4 w-4" />
              App verbinden
            </Button>
          </form>
        </Panel>
      </div>
    </AppShell>
  );
}
