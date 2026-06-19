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
  Sparkles,
  Timer,
  ToyBrick,
  UserRound,
  UsersRound
} from "lucide-react";
import { currentUser } from "@/lib/auth";
import { MobileMenu } from "@/components/mobile-menu";

const nav = [
  ["Dashboard", "/", LayoutDashboard],
  ["Lass uns spielen", "/activities", Sparkles],
  ["Stellungen", "/positions", ShieldCheck],
  ["Spielsachen", "/toys", ToyBrick],
  ["Sessions", "/sessions", Timer],
  ["Medien", "/media", Images],
  ["Nachrichten", "/messages", MessageCircle]
] as const;

const settingsNav = [
  ["Profil", "/profile", UserRound],
  ["Benutzer", "/settings/users", UsersRound],
  ["Telegram", "/settings/telegram", Settings],
  ["Daten", "/settings/data", DatabaseBackup],
  ["API Tokens", "/settings/api", KeyRound]
] as const;

export async function AppShell({ children }: { children: ReactNode }) {
  const user = await currentUser();
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
              {settingsNav.map(([label, href, Icon]) => (
                <Link key={href} href={href} className="flex min-h-9 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-graphite hover:bg-paper hover:text-redbrand">
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              ))}
            </div>
          </details>
        </nav>
        {user ? (
          <form action="/api/auth/logout" method="post" className="absolute bottom-6 left-5 right-5">
            <div className="mb-3 rounded-md bg-paper p-3 text-xs text-graphite">
              <div className="font-semibold text-ink">{user.name || user.username || user.email}</div>
              <div>{user.email}</div>
            </div>
            <button className="focus-ring w-full rounded-md border border-line px-3 py-2 text-sm font-medium hover:bg-paper">Abmelden</button>
          </form>
        ) : null}
      </aside>
      <main className="min-h-screen lg:pl-72">
        <MobileMenu />
        <div className="mx-auto flex min-h-[calc(100vh-4.5rem)] max-w-7xl flex-col px-4 py-6 sm:px-6 lg:min-h-screen lg:px-8">{children}</div>
      </main>
    </div>
  );
}
