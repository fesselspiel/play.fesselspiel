import Link from "next/link";
import { ReactNode } from "react";
import {
  DatabaseBackup,
  Images,
  KeyRound,
  LayoutDashboard,
  MessageCircle,
  Settings,
  ShieldCheck,
  Timer,
  ToyBrick,
  UserRound,
  UsersRound
} from "lucide-react";
import { currentSessionContext } from "@/lib/auth";
import { DarkModeToggle } from "@/components/dark-mode-toggle";
import { LogoutButton } from "@/components/logout-button";
import { MobileMenu } from "@/components/mobile-menu";

const nav = [
  ["Start", "/", LayoutDashboard],
  ["Szenen", "/positions", ShieldCheck],
  ["Spielsachen", "/toys", ToyBrick],
  ["Sessions", "/sessions", Timer],
  ["Bilder", "/media", Images]
] as const;

const settingsNav = [["Profil", "/profile", UserRound]] as const;

const adminOnlySettingsNav = [
  ["Benutzer", "/settings/users", UsersRound],
  ["Telegram", "/settings/telegram", Settings],
  ["Daten", "/settings/data", DatabaseBackup],
  ["API Tokens", "/settings/api", KeyRound],
  ["Protokoll", "/messages", MessageCircle]
] as const;

const adminSettingsNav = [["Ansicht wechseln", "/settings/view-as", UsersRound]] as const;

export async function AppShell({ children }: { children: ReactNode }) {
  const { actor, user } = await currentSessionContext();
  const isAdminActor = actor?.role === "ADMIN";
  const isViewingAs = Boolean(actor && user && actor.id !== user.id);
  const showAdminSettings = user?.role === "ADMIN";
  return (
    <div className="min-h-screen bg-canvas">
      <aside className="fixed inset-y-0 left-0 hidden w-72 border-r border-line bg-surface px-5 py-6 lg:block">
        <Link href="/" className="mb-8 block">
          <div className="text-xl font-semibold text-ink">Fesselspiel</div>
          <div className="text-sm text-graphite">play.fesselspiel.com</div>
        </Link>
        <nav className="space-y-1">
          {nav.map(([label, href, Icon]) => (
            <Link key={href} href={href} className="flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-graphite hover:bg-paper hover:text-redbrand">
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
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
              {settingsNav.map(([label, href, Icon]) => (
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
            <div className="mb-3 flex items-center gap-3 rounded-md bg-paper p-3 text-xs text-graphite">
              {user.profile?.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.profile.imageUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
              ) : (
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-redbrand text-sm font-semibold text-white">
                  {(user.profile?.displayName || user.name || user.username || user.email).slice(0, 1).toUpperCase()}
                </span>
              )}
              <div className="min-w-0">
                <div className="truncate font-semibold text-ink">{user.profile?.displayName || user.name || user.username || user.email}</div>
                <div className="truncate">{isViewingAs ? `Ansicht als ${user.username || user.email}` : user.email}</div>
              </div>
            </div>
            <LogoutButton className="focus-ring w-full rounded-md border border-line px-3 py-2 text-sm font-medium hover:bg-paper disabled:opacity-60" />
          </div>
        ) : null}
      </aside>
      <main className="min-h-screen lg:pl-72">
        <MobileMenu activeDarkMode={Boolean(user?.settings?.darkMode)} showAdminViewSwitch={isAdminActor} showAdminSettings={showAdminSettings} />
        <div className="mx-auto flex min-h-[calc(100vh-4.5rem)] max-w-7xl flex-col px-4 py-6 sm:px-6 lg:min-h-screen lg:px-8">{children}</div>
      </main>
    </div>
  );
}
