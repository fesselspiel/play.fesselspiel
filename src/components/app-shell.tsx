import Link from "next/link";
import { ReactNode } from "react";
import {
  DatabaseBackup,
  FileText,
  Images,
  KeyRound,
  Lightbulb,
  LayoutDashboard,
  ClipboardCheck,
  Mail,
  MessageCircle,
  Network,
  PackageSearch,
  Settings,
  Signal,
  SlidersHorizontal,
  ShieldCheck,
  Ticket,
  Timer,
  ToyBrick,
  UserRound,
  UsersRound
} from "lucide-react";
import { currentSessionContext } from "@/lib/auth";
import { DarkModeToggle } from "@/components/dark-mode-toggle";
import { LogoutButton } from "@/components/logout-button";
import { MobileMenu } from "@/components/mobile-menu";
import { featureEnabled, hasVisibleTrackerFeature } from "@/lib/features";
import { primaryTenantDomain } from "@/lib/tenancy";

const nav = [
  ["Start", "/", LayoutDashboard, null],
  ["Szenen", "/positions", ShieldCheck, "positions"],
  ["Spielsachen", "/toys", ToyBrick, "toys"],
  ["Bondage-System", "/bondage-system", PackageSearch, "shopifyBondageSystem"],
  ["Ideensammlung", "/ideas", Lightbulb, "ideas"],
  ["Aufträge", "/orders", ClipboardCheck, "orders"],
  ["Sessions", "/sessions", Timer, "trackers"],
  ["Bilder", "/media", Images, "media"]
] as const;

const primaryNav = nav.slice(0, 1);
const catalogNav = nav.slice(1, 4);
const ideasNav = nav.slice(4, 5);
const workNav = nav.slice(5, 7);
const pictureNav = nav.slice(7);

const settingsNav = [
  ["Profil", "/profile", UserRound, null],
  ["Ampel", "/settings/play-ready", Signal, "playReady"],
  ["Einladungen", "/settings/invites", Ticket, "invites"]
] as const;

const adminOnlySettingsNav = [
  ["Seite", "/settings/tenant", SlidersHorizontal],
  ["Benutzer", "/settings/users", UsersRound],
  ["Shopify", "/settings/shopify", PackageSearch],
  ["Tracker", "/settings/trackers", Timer],
  ["Telegram", "/settings/telegram", Settings],
  ["E-Mail", "/settings/email", Mail],
  ["Anleitung", "/settings/help", FileText],
  ["Daten", "/settings/data", DatabaseBackup],
  ["API Tokens", "/settings/api", KeyRound],
  ["Protokoll", "/messages", MessageCircle]
] as const;

const adminSettingsNav = [["Ansicht wechseln", "/settings/view-as", UsersRound]] as const;
const superAdminSettingsNav = [["Seiten", "/settings/sites", Network]] as const;

export async function AppShell({ children }: { children: ReactNode }) {
  const { actor, user, tenant } = await currentSessionContext();
  const isAdminActor = actor?.role === "ADMIN" || actor?.role === "SUPER_ADMIN";
  const isViewingAs = Boolean(actor && user && actor.id !== user.id);
  const showAdminSettings = isAdminActor;
  const tenantName = tenant?.name || "Fesselspiel";
  const tenantDomain = tenant ? primaryTenantDomain(tenant) : "playplaner.com";
  const userName = user ? user.profile?.displayName || user.name || user.username || user.email : "";
  const userEmail = user?.email || "";
  const features = tenant?.features || [];
  const navFeatureVisible = (feature: string | null) => !feature || (feature === "trackers" ? hasVisibleTrackerFeature(features) : featureEnabled(features, feature));
  const visiblePrimaryNav = primaryNav.filter(([, , , feature]) => navFeatureVisible(feature));
  const visibleCatalogNav = catalogNav.filter(([, , , feature]) => navFeatureVisible(feature));
  const visibleIdeasNav = ideasNav.filter(([, , , feature]) => navFeatureVisible(feature));
  const visibleWorkNav = workNav.filter(([, , , feature]) => navFeatureVisible(feature));
  const visiblePictureNav = pictureNav.filter(([, , , feature]) => navFeatureVisible(feature));
  const visibleSettingsNav = settingsNav.filter(([, , , feature]) => navFeatureVisible(feature));
  return (
    <div className="min-h-screen bg-canvas">
      <aside className="fixed inset-y-0 left-0 hidden w-72 border-r border-line bg-surface px-5 py-6 lg:block">
        <Link href="/" className="mb-8 block">
          <div className="text-xl font-semibold text-ink">{tenantName}</div>
          <div className="text-sm text-graphite">{tenantDomain}</div>
        </Link>
        <nav className="space-y-1">
          {visiblePrimaryNav.map(([label, href, Icon]) => (
            <Link key={href} href={href} className="flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-graphite hover:bg-paper hover:text-redbrand">
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
          <div className="my-3 border-t border-line" />
          {visibleCatalogNav.map(([label, href, Icon]) => (
            <Link key={href} href={href} className="flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-graphite hover:bg-paper hover:text-redbrand">
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
          <div className="my-3 border-t border-line" />
          {visibleIdeasNav.map(([label, href, Icon]) => (
            <Link key={href} href={href} className="flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-graphite hover:bg-paper hover:text-redbrand">
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
          <div className="my-3 border-t border-line" />
          {visibleWorkNav.map(([label, href, Icon]) => (
            <Link key={href} href={href} className="flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-graphite hover:bg-paper hover:text-redbrand">
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
          <div className="my-3 border-t border-line" />
          {visiblePictureNav.map(([label, href, Icon]) => (
            <Link key={href} href={href} className="flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-graphite hover:bg-paper hover:text-redbrand">
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
          {user ? (
            <div className="my-3 rounded-md border border-line bg-paper p-2">
              <DarkModeToggle active={Boolean(user.settings?.darkMode)} />
            </div>
          ) : null}
          <div className="my-3 border-t border-line" />
          <details className="group rounded-md">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-graphite hover:bg-paper hover:text-redbrand [&::-webkit-details-marker]:hidden">
              <Settings className="h-4 w-4" />
              Einstellungen
            </summary>
            <div className="mt-1 space-y-1 border-l border-line pl-4">
              {isAdminActor ? adminSettingsNav.map(([label, href, Icon]) => (
                <Link key={href} href={href} className="flex min-h-9 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-graphite hover:bg-paper hover:text-redbrand">
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              )) : null}
              {actor?.role === "SUPER_ADMIN" ? superAdminSettingsNav.map(([label, href, Icon]) => (
                <Link key={href} href={href} className="flex min-h-9 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-graphite hover:bg-paper hover:text-redbrand">
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              )) : null}
              {visibleSettingsNav.map(([label, href, Icon]) => (
                <Link key={href} href={href} className="flex min-h-9 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-graphite hover:bg-paper hover:text-redbrand">
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              ))}
              {showAdminSettings ? adminOnlySettingsNav.map(([label, href, Icon]) => (
                <Link key={href} href={href} className="flex min-h-9 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-graphite hover:bg-paper hover:text-redbrand">
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              )) : null}
              {user ? <DarkModeToggle active={Boolean(user.settings?.darkMode)} /> : null}
            </div>
          </details>
        </nav>
        {user ? (
          <div className="absolute bottom-6 left-5 right-5">
            <Link href="/profile" className="mb-3 flex items-center gap-3 rounded-md bg-paper p-3 text-xs text-graphite hover:bg-canvas hover:text-redbrand">
              {user.profile?.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.profile.imageUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
              ) : (
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-redbrand text-sm font-semibold text-white">
                  {(user.profile?.displayName || user.name || user.username || user.email).slice(0, 1).toUpperCase()}
                </span>
              )}
              <div className="min-w-0">
                <div className="truncate font-semibold text-ink">{userName}</div>
                <div className="truncate">{isViewingAs ? `Ansicht als ${user.username || user.email}` : user.email}</div>
              </div>
            </Link>
            <LogoutButton className="focus-ring w-full rounded-md border border-line px-3 py-2 text-sm font-medium hover:bg-paper disabled:opacity-60" />
          </div>
        ) : null}
      </aside>
      <main className="min-h-screen lg:pl-72">
        <MobileMenu
          activeDarkMode={Boolean(user?.settings?.darkMode)}
          showAdminViewSwitch={isAdminActor}
          showSiteManagement={actor?.role === "SUPER_ADMIN"}
          showAdminSettings={showAdminSettings}
          tenantName={tenantName}
          tenantDomain={tenantDomain}
          disabledFeatures={features.filter((feature) => !feature.enabled).map((feature) => feature.key)}
          enabledFeatures={features.filter((feature) => feature.enabled).map((feature) => feature.key)}
          userName={userName}
          userEmail={userEmail}
          userImageUrl={user?.profile?.imageUrl}
          viewAsLabel={user && isViewingAs ? `Ansicht als ${user.username || user.email}` : undefined}
        />
        <div className="mx-auto flex min-h-[calc(100vh-4.5rem)] max-w-7xl flex-col px-4 py-6 sm:px-6 lg:min-h-screen lg:px-8">{children}</div>
      </main>
    </div>
  );
}
