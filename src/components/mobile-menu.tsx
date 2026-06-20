"use client";

import Link from "next/link";
import {
  DatabaseBackup,
  Images,
  KeyRound,
  LayoutDashboard,
  Menu,
  MessageCircle,
  Settings,
  ShieldCheck,
  Sparkles,
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
  ["Dashboard", "/", LayoutDashboard],
  ["Lass uns spielen", "/activities", Sparkles],
  ["Stellungen", "/positions", ShieldCheck],
  ["Spielsachen", "/toys", ToyBrick],
  ["Sessions", "/sessions", Timer],
  ["Medien", "/media", Images]
] as const;

const mobileSettingsNav = [
  ["Profil", "/profile", UserRound],
  ["Benutzer", "/settings/users", UsersRound],
  ["Telegram", "/settings/telegram", Settings],
  ["Daten", "/settings/data", DatabaseBackup],
  ["API Tokens", "/settings/api", KeyRound],
  ["Protokoll", "/messages", MessageCircle]
] as const;

const adminMobileSettingsNav = [["Ansicht wechseln", "/settings/view-as", UsersRound]] as const;

export function MobileMenu({ activeDarkMode = false, showAdminViewSwitch = false }: { activeDarkMode?: boolean; showAdminViewSwitch?: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/95 px-4 py-3 backdrop-blur lg:hidden">
      <div className="flex min-h-10 items-center justify-between gap-3">
        <Link href="/" onClick={() => setOpen(false)} className="min-w-0">
          <div className="truncate font-semibold text-ink">Fesselspiel</div>
          <div className="truncate text-xs text-graphite">play.fesselspiel.com</div>
        </Link>
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
      {open ? (
        <div
          id="mobile-navigation"
          className="absolute left-0 right-0 top-full z-40 max-h-[calc(100dvh-4.25rem)] overflow-y-auto overscroll-contain border-b border-line bg-surface px-4 pb-6 pt-3 shadow-soft [-webkit-overflow-scrolling:touch]"
        >
          <nav className="overflow-hidden rounded-md border border-line bg-surface">
            {mobileNav.map(([label, href, Icon]) => (
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
