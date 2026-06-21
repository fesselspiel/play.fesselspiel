"use client";

import Link from "next/link";
import {
  DatabaseBackup,
  Images,
  KeyRound,
  LayoutDashboard,
  Mail,
  Menu,
  MessageCircle,
  Network,
  Settings,
  SlidersHorizontal,
  ShieldCheck,
  Timer,
  ToyBrick,
  UserRound,
  UsersRound,
  X
} from "lucide-react";
import { useState } from "react";
import { DarkModeToggle } from "@/components/dark-mode-toggle";
import { LogoutButton } from "@/components/logout-button";

const mobileNav = [
  ["Start", "/", LayoutDashboard, null],
  ["Szenen", "/positions", ShieldCheck, "positions"],
  ["Spielsachen", "/toys", ToyBrick, "toys"],
  ["Sessions", "/sessions", Timer, "trackers"],
  ["Bilder", "/media", Images, "media"]
] as const;

const primaryMobileNav = mobileNav.slice(0, 1);
const catalogMobileNav = mobileNav.slice(1, 4);
const pictureMobileNav = mobileNav.slice(4);

const mobileSettingsNav = [["Profil", "/profile", UserRound]] as const;

const adminOnlyMobileSettingsNav = [
  ["Seite", "/settings/tenant", SlidersHorizontal],
  ["Benutzer", "/settings/users", UsersRound],
  ["Telegram", "/settings/telegram", Settings],
  ["E-Mail", "/settings/email", Mail],
  ["Daten", "/settings/data", DatabaseBackup],
  ["API Tokens", "/settings/api", KeyRound],
  ["Protokoll", "/messages", MessageCircle]
] as const;

const adminMobileSettingsNav = [["Ansicht wechseln", "/settings/view-as", UsersRound]] as const;
const superAdminMobileSettingsNav = [["Seiten", "/settings/sites", Network]] as const;

function isVisible(feature: string | null, enabledFeatures: string[]) {
  return !feature || enabledFeatures.includes(feature);
}

export function MobileMenu({
  activeDarkMode = false,
  showAdminViewSwitch = false,
  showSiteManagement = false,
  showAdminSettings = false,
  tenantName = "Fesselspiel",
  tenantDomain = "playplaner.com",
  enabledFeatures = []
}: {
  activeDarkMode?: boolean;
  showAdminViewSwitch?: boolean;
  showSiteManagement?: boolean;
  showAdminSettings?: boolean;
  tenantName?: string;
  tenantDomain?: string;
  enabledFeatures?: string[];
}) {
  const [open, setOpen] = useState(false);
  const visiblePrimaryNav = primaryMobileNav.filter(([, , , feature]) => isVisible(feature, enabledFeatures));
  const visibleCatalogNav = catalogMobileNav.filter(([, , , feature]) => isVisible(feature, enabledFeatures));
  const visiblePictureNav = pictureMobileNav.filter(([, , , feature]) => isVisible(feature, enabledFeatures));

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/95 px-4 py-3 backdrop-blur lg:hidden">
      <div className="flex min-h-10 items-center justify-between gap-3">
        <Link href="/" onClick={() => setOpen(false)} className="min-w-0">
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
          className="absolute left-0 right-0 top-full z-40 max-h-[calc(100dvh-4.25rem)] overflow-y-auto overscroll-contain border-b border-line bg-surface px-4 pb-6 pt-3 shadow-soft [-webkit-overflow-scrolling:touch]"
        >
          <nav className="overflow-hidden rounded-md border border-line bg-surface">
            {visiblePrimaryNav.map(([label, href, Icon]) => (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className="flex min-h-11 items-center gap-3 border-b border-line bg-surface px-3 py-2 text-sm font-medium text-graphite last:border-b-0 hover:bg-paper hover:text-redbrand"
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}
            <div className="h-3 border-b border-line bg-paper" />
            {visibleCatalogNav.map(([label, href, Icon]) => (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className="flex min-h-11 items-center gap-3 border-b border-line bg-surface px-3 py-2 text-sm font-medium text-graphite last:border-b-0 hover:bg-paper hover:text-redbrand"
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}
            <div className="h-3 border-b border-line bg-paper" />
            {visiblePictureNav.map(([label, href, Icon]) => (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className="flex min-h-11 items-center gap-3 border-b border-line bg-surface px-3 py-2 text-sm font-medium text-graphite last:border-b-0 hover:bg-paper hover:text-redbrand"
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}
            <div className="h-3 border-b border-line bg-paper" />
            <details className="border-b border-line bg-surface last:border-b-0">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 bg-surface px-3 py-2 text-sm font-medium text-graphite hover:bg-paper hover:text-redbrand [&::-webkit-details-marker]:hidden">
                <Settings className="h-4 w-4" />
                Einstellungen
              </summary>
              <div className="border-t border-line bg-paper px-2 py-2">
                {showAdminViewSwitch ? adminMobileSettingsNav.map(([label, href, Icon]) => (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setOpen(false)}
                    className="flex min-h-10 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-graphite hover:bg-surface hover:text-redbrand"
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </Link>
                )) : null}
                {showSiteManagement ? superAdminMobileSettingsNav.map(([label, href, Icon]) => (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setOpen(false)}
                    className="flex min-h-10 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-graphite hover:bg-surface hover:text-redbrand"
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </Link>
                )) : null}
                {mobileSettingsNav.map(([label, href, Icon]) => (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setOpen(false)}
                    className="flex min-h-10 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-graphite hover:bg-surface hover:text-redbrand"
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </Link>
                ))}
                {showAdminSettings ? adminOnlyMobileSettingsNav.map(([label, href, Icon]) => (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setOpen(false)}
                    className="flex min-h-10 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-graphite hover:bg-surface hover:text-redbrand"
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </Link>
                )) : null}
                <DarkModeToggle active={activeDarkMode} />
                <LogoutButton className="flex min-h-10 w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-medium text-redbrand hover:bg-surface disabled:opacity-60" />
              </div>
            </details>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
