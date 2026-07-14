import Link from "next/link";
import { PauseCircle } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Panel } from "@/components/ui";
import { currentSessionContext } from "@/lib/auth";
import { featureCatalog } from "@/lib/features";
import { currentTenant, primaryTenantDomain } from "@/lib/tenancy";

export default async function FeatureDisabledPage(props: { searchParams: Promise<{ feature?: string }> }) {
  const searchParams = await props.searchParams;
  const { actor, user, tenant } = await currentSessionContext();
  const pageTenant = tenant || (await currentTenant());
  const feature = featureCatalog.find((entry) => entry.key === searchParams.feature);
  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN" || actor?.role === "SUPER_ADMIN";
  const isSuperAdmin = actor?.role === "SUPER_ADMIN";
  const title = pageTenant?.disabledTitle || "Dieser Bereich macht gerade Pause";
  const text = pageTenant?.disabledText || "Dieses Feature ist auf dieser Seite momentan nicht eingeschaltet. Falls du es erwartest, sprich kurz mit der Person, die diese Seite verwaltet. Eure vorhandenen Daten bleiben dabei erhalten.";
  const buttonText = pageTenant?.disabledButtonText || "Zur Startseite";
  const buttonHref = pageTenant?.disabledButtonHref || "/";
  return (
    <AppShell>
      <div className="flex min-h-[70vh] items-center justify-center">
        <Panel className="max-w-2xl text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-redbrand/10 text-redbrand">
            <PauseCircle className="h-7 w-7" />
          </div>
          <p className="mb-2 text-sm font-semibold text-redbrand">{pageTenant?.name || "Diese Seite"}{pageTenant ? ` · ${primaryTenantDomain(pageTenant)}` : ""}</p>
          <h1 className="text-3xl font-semibold text-ink">{title}</h1>
          <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-graphite">{text}</p>
          {feature ? <p className="mt-4 text-sm text-graphite">Bereich: {feature.label}</p> : null}
          {isAdmin ? (
            <div className="mt-6 rounded-md border border-line bg-paper p-4 text-left text-sm leading-6 text-graphite">
              Du kannst diesen Bereich unter <Link href="/settings/tenant" className="font-semibold text-redbrand">Einstellungen → Seite</Link> wieder aktivieren.
              {isSuperAdmin ? <> Oder prüfe die Feature-Konfiguration in <Link href="/settings/sites" className="font-semibold text-redbrand">Einstellungen → Seiten</Link>.</> : null}
            </div>
          ) : null}
          <div className="mt-7">
            <Link href={buttonHref} className="inline-flex min-h-11 items-center justify-center rounded-md bg-redbrand px-5 py-3 text-sm font-semibold text-white hover:bg-redbrandHover">
              {buttonText}
            </Link>
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}
