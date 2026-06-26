import Link from "next/link";
import { ReactNode } from "react";
import {
  RotateCcw,
  Settings
} from "lucide-react";
import { currentSessionContext } from "@/lib/auth";
import { DarkModeToggle } from "@/components/dark-mode-toggle";
import { LogoutButton } from "@/components/logout-button";
import { MobileMenu } from "@/components/mobile-menu";
import { navItemVisible } from "@/lib/feature-utils";
import {
  mainNavigationSections,
  settingsNavigationItems
} from "@/lib/app-navigation";
import { primaryTenantDomain } from "@/lib/tenancy";
import { returnToOwnView } from "@/lib/view-as";

export async function AppShell({ children }: { children: ReactNode }) {
  const { actor, user, tenant } = await currentSessionContext();
  const isAdminActor = actor?.role === "ADMIN" || actor?.role === "SUPER_ADMIN";
  const isViewingAs = Boolean(actor && user && actor.id !== user.id);
  const showAdminSettings = isAdminActor && !isViewingAs;
  const tenantName = tenant?.name || "Fesselspiel";
  const tenantDomain = tenant ? primaryTenantDomain(tenant) : "playplaner.com";
  const userName = user ? user.profile?.displayName || user.name || user.username || user.email : "";
  const userEmail = user?.email || "";
  const features = tenant?.features || [];
  const linkSections = mainNavigationSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => navItemVisible(features, item.feature))
    }))
    .filter((section) => section.items.length > 0);
  const visibleSettings = {
    profileAndSettings: settingsNavigationItems.profileAndSettings.filter((item) =>
      navItemVisible(features, item.feature)
    ),
    admin: settingsNavigationItems.admin.filter((item) => navItemVisible(features, item.feature)),
    adminViewSwitch: settingsNavigationItems.viewAs,
    superAdmin: settingsNavigationItems.superAdmin
  };
  return (
    <div className="min-h-screen bg-canvas">
      <aside className="fixed inset-y-0 left-0 hidden w-72 flex-col border-r border-line bg-surface px-5 py-6 lg:flex">
        <Link href="/" className="mb-8 block shrink-0">
          <div className="text-xl font-semibold text-ink">{tenantName}</div>
          <div className="text-sm text-graphite">{tenantDomain}</div>
        </Link>
        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain pr-1 [-webkit-overflow-scrolling:touch]">
          {isViewingAs ? (
            <form action={returnToOwnView} className="mb-3 rounded-md border border-redbrand/30 bg-redbrand/10 p-2">
              <button type="submit" className="flex min-h-10 w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-redbrand hover:bg-surface">
                <RotateCcw className="h-4 w-4" />
                Zur eigenen Ansicht
              </button>
            </form>
          ) : null}
          {linkSections.map((section, index) => (
            <div key={section.id}>
              {index > 0 ? <div className="my-3 border-t border-line" /> : null}
              {section.items.map(({ label, href, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-graphite hover:bg-paper hover:text-redbrand"
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              ))}
            </div>
          ))}
          <div className="my-3 border-t border-line" />
          <details className="group rounded-md">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-graphite hover:bg-paper hover:text-redbrand [&::-webkit-details-marker]:hidden">
              <Settings className="h-4 w-4" />
              Einstellungen
            </summary>
            <div className="mt-1 space-y-1 border-l border-line pl-4">
              {showAdminSettings ? visibleSettings.adminViewSwitch.map(({ label, href, icon: Icon }) => (
                <Link key={href} href={href} className="flex min-h-9 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-graphite hover:bg-paper hover:text-redbrand">
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              )) : null}
              {showAdminSettings && actor?.role === "SUPER_ADMIN" ? visibleSettings.superAdmin.map(({ label, href, icon: Icon }) => (
                <Link key={href} href={href} className="flex min-h-9 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-graphite hover:bg-paper hover:text-redbrand">
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              )) : null}
              {visibleSettings.profileAndSettings.map(({ label, href, icon: Icon }) => (
                <Link key={href} href={href} className="flex min-h-9 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-graphite hover:bg-paper hover:text-redbrand">
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              ))}
              {showAdminSettings ? visibleSettings.admin.map(({ label, href, icon: Icon }) => (
                <Link key={href} href={href} className="flex min-h-9 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-graphite hover:bg-paper hover:text-redbrand">
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              )) : null}
            </div>
          </details>
        </nav>
        {user ? (
          <div className="mt-4 shrink-0 border-t border-line pt-3">
            <div className="mb-3 rounded-md border border-line bg-paper p-2">
              <DarkModeToggle active={Boolean(user.settings?.darkMode)} />
            </div>
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
        {isViewingAs ? (
          <form action={returnToOwnView} className="sticky top-[4.5rem] z-20 border-b border-redbrand/20 bg-redbrand/10 px-4 py-2 lg:hidden">
            <button type="submit" className="flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-surface px-3 py-2 text-sm font-semibold text-redbrand shadow-soft">
              <RotateCcw className="h-4 w-4" />
              Zur eigenen Ansicht
            </button>
          </form>
        ) : null}
        <MobileMenu
          activeDarkMode={Boolean(user?.settings?.darkMode)}
          showAdminViewSwitch={showAdminSettings}
          showSiteManagement={showAdminSettings && actor?.role === "SUPER_ADMIN"}
          showAdminSettings={showAdminSettings}
          tenantName={tenantName}
          tenantDomain={tenantDomain}
          features={features}
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
