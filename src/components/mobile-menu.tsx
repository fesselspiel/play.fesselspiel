"use client";

import Link from "next/link";
import { Menu, Settings, X } from "lucide-react";
import { useEffect, useState } from "react";
import { mainNavigationSections, settingsNavigationItems } from "@/lib/app-navigation";
import { navItemVisible } from "@/lib/feature-utils";
import { DarkModeToggle } from "@/components/dark-mode-toggle";
import { LogoutButton } from "@/components/logout-button";

export function MobileMenu({
  activeDarkMode = false,
  showAdminViewSwitch = false,
  showSiteManagement = false,
  showAdminSettings = false,
  tenantName = "Fesselspiel",
  tenantDomain = "playplaner.com",
  features = [],
  userName,
  userEmail,
  userImageUrl,
  viewAsLabel
}: {
  activeDarkMode?: boolean;
  showAdminViewSwitch?: boolean;
  showSiteManagement?: boolean;
  showAdminSettings?: boolean;
  tenantName?: string;
  tenantDomain?: string;
  features?: { key: string; enabled: boolean }[];
  userName?: string;
  userEmail?: string;
  userImageUrl?: string | null;
  viewAsLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const navSections = mainNavigationSections
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

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function closeMenu() {
    setOpen(false);
  }

  const linkClass = "flex min-h-11 items-center gap-3 border-b border-line bg-surface px-3 py-2 text-sm font-medium text-graphite last:border-b-0 hover:bg-paper hover:text-redbrand";
  const settingsLinkClass = "flex min-h-10 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-graphite hover:bg-surface hover:text-redbrand";

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/95 px-4 py-3 backdrop-blur lg:hidden">
      <div className="flex min-h-10 items-center justify-between gap-3">
        <Link href="/" onClick={closeMenu} className="min-w-0">
          <div className="truncate font-semibold text-ink">{tenantName}</div>
          <div className="truncate text-xs text-graphite">{tenantDomain}</div>
        </Link>
        <div className="flex shrink-0 items-center gap-2">
          <DarkModeToggle active={activeDarkMode} compact />
          <button
            type="button"
            aria-expanded={open}
            aria-controls="mobile-navigation"
            onClick={() => setOpen((value) => !value)}
            className="focus-ring inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-line bg-surface text-ink shadow-soft"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            <span className="sr-only">Menü</span>
          </button>
        </div>
      </div>
      {open ? (
        <div
          id="mobile-navigation"
          className="fixed inset-0 z-50 lg:hidden"
        >
          <button type="button" className="absolute inset-0 h-full w-full bg-black/20" aria-label="Menü schließen" onClick={closeMenu} />
          <div className="absolute inset-x-0 top-0 flex h-[100dvh] max-h-[100dvh] flex-col border-b border-line bg-surface shadow-soft">
            <div className="flex min-h-16 shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-3">
              <Link href="/" onClick={closeMenu} className="min-w-0">
                <div className="truncate font-semibold text-ink">{tenantName}</div>
                <div className="truncate text-xs text-graphite">{tenantDomain}</div>
              </Link>
              <button
                type="button"
                onClick={closeMenu}
                className="focus-ring inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-line bg-surface text-ink shadow-soft"
              >
                <X className="h-5 w-5" />
                <span className="sr-only">Menü schließen</span>
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3 touch-pan-y [-webkit-overflow-scrolling:touch]">
              <nav className="overflow-hidden rounded-md border border-line bg-surface">
                {navSections.map((section, index) => (
                  <div key={section.id}>
                    {index > 0 ? <div className="h-3 border-b border-line bg-paper" /> : null}
                    {section.items.map(({ label, href, icon: Icon }) => (
                      <Link key={href} href={href} onClick={closeMenu} className={linkClass}>
                        <Icon className="h-4 w-4" />
                        {label}
                      </Link>
                    ))}
                  </div>
                ))}
                <div className="h-3 border-b border-line bg-paper" />
                <details className="border-b border-line bg-surface last:border-b-0" open>
                  <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 bg-surface px-3 py-2 text-sm font-medium text-graphite hover:bg-paper hover:text-redbrand [&::-webkit-details-marker]:hidden">
                    <Settings className="h-4 w-4" />
                    Einstellungen
                  </summary>
                  <div className="border-t border-line bg-paper px-2 py-2">
                    {showAdminViewSwitch ? visibleSettings.adminViewSwitch.map(({ label, href, icon: Icon }) => (
                      <Link key={href} href={href} onClick={closeMenu} className={settingsLinkClass}>
                        <Icon className="h-4 w-4" />
                        {label}
                      </Link>
                    )) : null}
                    {showSiteManagement ? visibleSettings.superAdmin.map(({ label, href, icon: Icon }) => (
                      <Link key={href} href={href} onClick={closeMenu} className={settingsLinkClass}>
                        <Icon className="h-4 w-4" />
                        {label}
                      </Link>
                    )) : null}
                    {visibleSettings.profileAndSettings.map(({ label, href, icon: Icon }) => (
                      <Link key={href} href={href} onClick={closeMenu} className={settingsLinkClass}>
                        <Icon className="h-4 w-4" />
                        {label}
                      </Link>
                    ))}
                    {showAdminSettings ? visibleSettings.admin.map(({ label, href, icon: Icon }) => (
                      <Link key={href} href={href} onClick={closeMenu} className={settingsLinkClass}>
                        <Icon className="h-4 w-4" />
                        {label}
                      </Link>
                    )) : null}
                    <DarkModeToggle active={activeDarkMode} />
                    <LogoutButton className="flex min-h-10 w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-medium text-redbrand hover:bg-surface disabled:opacity-60" />
                  </div>
                </details>
              </nav>
              {userName || userEmail ? (
                <Link
                  href="/profile"
                  onClick={closeMenu}
                  className="mt-3 flex min-h-16 items-center gap-3 rounded-md border border-line bg-paper p-3 text-sm text-graphite hover:bg-surface hover:text-redbrand"
                >
                  {userImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={userImageUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
                  ) : (
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-redbrand text-sm font-semibold text-white">
                      {(userName || userEmail || "?").slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-ink">{userName || userEmail}</span>
                    <span className="block truncate text-xs">{viewAsLabel || userEmail}</span>
                  </span>
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
