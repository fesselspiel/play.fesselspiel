"use client";

import Link from "next/link";
import {
  DatabaseBackup,
  FileText,
  Images,
  KeyRound,
  Lightbulb,
  LayoutDashboard,
  ClipboardCheck,
  Mail,
  Menu,
  MessageCircle,
  Network,
  PackageSearch,
  Settings,
  Signal,
  CalendarDays,
  SlidersHorizontal,
  ShieldCheck,
  Ticket,
  Timer,
  ToyBrick,
  UserRound,
  UsersRound,
  X
} from "lucide-react";
import { useEffect, useState } from "react";
import { DarkModeToggle } from "@/components/dark-mode-toggle";
import { LogoutButton } from "@/components/logout-button";

const mobileNav = [
  ["Start", "/", LayoutDashboard, null],
  ["Szenen", "/positions", ShieldCheck, "positions"],
  ["Spielsachen", "/toys", ToyBrick, "toys"],
  ["Bondage-System", "/bondage-system", PackageSearch, "shopifyBondageSystem"],
  ["Ideensammlung", "/ideas", Lightbulb, "ideas"],
  ["Aufträge", "/orders", ClipboardCheck, "orders"],
  ["Sessions", "/sessions", Timer, "trackers"],
  ["Bilder", "/media", Images, "media"]
] as const;

const primaryMobileNav = mobileNav.slice(0, 1);
const catalogMobileNav = mobileNav.slice(1, 4);
const ideasMobileNav = mobileNav.slice(4, 5);
const workMobileNav = mobileNav.slice(5, 7);
const pictureMobileNav = mobileNav.slice(7);

const mobileSettingsNav = [
  ["Profil", "/profile", UserRound, null],
  ["Ampel", "/settings/play-ready", Signal, "playReady"],
  ["Einladungen", "/settings/invites", Ticket, "invites"],
  ["Zeitregeln", "/settings/scheduled", CalendarDays, "scheduledRules"]
] as const;

const adminOnlyMobileSettingsNav = [
  ["Seite", "/settings/tenant", SlidersHorizontal],
  ["Startseite", "/settings/home", LayoutDashboard],
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

const adminMobileSettingsNav = [["Ansicht wechseln", "/settings/view-as", UsersRound]] as const;
const superAdminMobileSettingsNav = [["Seiten", "/settings/sites", Network]] as const;

function isVisible(feature: string | null, disabledFeatures: string[], enabledFeatures: string[]) {
  if (!feature) return true;
  if (disabledFeatures.includes(feature)) return false;
  if (feature === "trackers") return enabledFeatures.some((entry) => entry.startsWith("tracker.") && !disabledFeatures.includes(entry));
  if (feature === "orders") return !disabledFeatures.includes("activities") && !disabledFeatures.includes("selfBondage") && !disabledFeatures.includes("positions");
  if (feature === "selfBondage") return !disabledFeatures.includes(feature) && !disabledFeatures.includes("positions");
  if (feature.startsWith("tracker.")) return !disabledFeatures.includes(feature) && !disabledFeatures.includes("trackers");
  return true;
}

export function MobileMenu({
  activeDarkMode = false,
  showAdminViewSwitch = false,
  showSiteManagement = false,
  showAdminSettings = false,
  tenantName = "Fesselspiel",
  tenantDomain = "playplaner.com",
  disabledFeatures = [],
  enabledFeatures = [],
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
  disabledFeatures?: string[];
  enabledFeatures?: string[];
  userName?: string;
  userEmail?: string;
  userImageUrl?: string | null;
  viewAsLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const visiblePrimaryNav = primaryMobileNav.filter(([, , , feature]) => isVisible(feature, disabledFeatures, enabledFeatures));
  const visibleCatalogNav = catalogMobileNav.filter(([, , , feature]) => isVisible(feature, disabledFeatures, enabledFeatures));
  const visibleIdeasNav = ideasMobileNav.filter(([, , , feature]) => isVisible(feature, disabledFeatures, enabledFeatures));
  const visibleWorkNav = workMobileNav.filter(([, , , feature]) => isVisible(feature, disabledFeatures, enabledFeatures));
  const visiblePictureNav = pictureMobileNav.filter(([, , , feature]) => isVisible(feature, disabledFeatures, enabledFeatures));
  const visibleSettingsNav = mobileSettingsNav.filter(([, , , feature]) => isVisible(feature, disabledFeatures, enabledFeatures));

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
                {visiblePrimaryNav.map(([label, href, Icon]) => (
                  <Link key={href} href={href} onClick={closeMenu} className={linkClass}>
                    <Icon className="h-4 w-4" />
                    {label}
                  </Link>
                ))}
                <div className="h-3 border-b border-line bg-paper" />
                {visibleCatalogNav.map(([label, href, Icon]) => (
                  <Link key={href} href={href} onClick={closeMenu} className={linkClass}>
                    <Icon className="h-4 w-4" />
                    {label}
                  </Link>
                ))}
                <div className="h-3 border-b border-line bg-paper" />
                {visibleIdeasNav.map(([label, href, Icon]) => (
                  <Link key={href} href={href} onClick={closeMenu} className={linkClass}>
                    <Icon className="h-4 w-4" />
                    {label}
                  </Link>
                ))}
                <div className="h-3 border-b border-line bg-paper" />
                {visibleWorkNav.map(([label, href, Icon]) => (
                  <Link key={href} href={href} onClick={closeMenu} className={linkClass}>
                    <Icon className="h-4 w-4" />
                    {label}
                  </Link>
                ))}
                <div className="h-3 border-b border-line bg-paper" />
                {visiblePictureNav.map(([label, href, Icon]) => (
                  <Link key={href} href={href} onClick={closeMenu} className={linkClass}>
                    <Icon className="h-4 w-4" />
                    {label}
                  </Link>
                ))}
                <div className="h-3 border-b border-line bg-paper" />
                <details className="border-b border-line bg-surface last:border-b-0" open>
                  <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 bg-surface px-3 py-2 text-sm font-medium text-graphite hover:bg-paper hover:text-redbrand [&::-webkit-details-marker]:hidden">
                    <Settings className="h-4 w-4" />
                    Einstellungen
                  </summary>
                  <div className="border-t border-line bg-paper px-2 py-2">
                    {showAdminViewSwitch ? adminMobileSettingsNav.map(([label, href, Icon]) => (
                      <Link key={href} href={href} onClick={closeMenu} className={settingsLinkClass}>
                        <Icon className="h-4 w-4" />
                        {label}
                      </Link>
                    )) : null}
                    {showSiteManagement ? superAdminMobileSettingsNav.map(([label, href, Icon]) => (
                      <Link key={href} href={href} onClick={closeMenu} className={settingsLinkClass}>
                        <Icon className="h-4 w-4" />
                        {label}
                      </Link>
                    )) : null}
                    {visibleSettingsNav.map(([label, href, Icon]) => (
                      <Link key={href} href={href} onClick={closeMenu} className={settingsLinkClass}>
                        <Icon className="h-4 w-4" />
                        {label}
                      </Link>
                    ))}
                    {showAdminSettings ? adminOnlyMobileSettingsNav.map(([label, href, Icon]) => (
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
