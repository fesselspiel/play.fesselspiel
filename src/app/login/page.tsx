import {
  Bot,
  CalendarDays,
  Camera,
  CheckCircle2,
  Image as ImageIcon,
  KeyRound,
  LockKeyhole,
  MessageSquareText,
  Palette,
  ShieldCheck,
  Signal,
  Sparkles,
  Timer,
  ToyBrick,
  UsersRound
} from "lucide-react";
import { LoginForm } from "@/components/login-form";
import { Panel } from "@/components/ui";
import { currentTenant, primaryTenantDomain } from "@/lib/tenancy";

const featureCards = [
  {
    title: "Spielplanung",
    text: "Termine, Aufträge, Ideen und gemeinsame Vorhaben landen in einer klaren Wochenansicht.",
    Icon: CalendarDays
  },
  {
    title: "Szenen & Spielsachen",
    text: "Szenen, Ausrüstung, Bilder und Verknüpfungen bilden ein flexibles Baukastensystem.",
    Icon: ToyBrick
  },
  {
    title: "Session-Tracking",
    text: "Segufix- und KG-Zeiten werden mit Dauer, Verlauf, Stimmung und Detailseiten dokumentiert.",
    Icon: Timer
  },
  {
    title: "Bildergalerie",
    text: "Geschützte Alben, Bildzuschnitt, Vollbildansicht und ideenbezogene Anhänge bleiben privat.",
    Icon: ImageIcon
  },
  {
    title: "Telegram-Agent",
    text: "Der Bot beantwortet Fragen, führt Aktionen aus und nutzt gespeicherten Gesprächskontext.",
    Icon: Bot
  },
  {
    title: "Kreise & Rechte",
    text: "Paare und vertraute Kreise teilen Inhalte automatisch nach den passenden Berechtigungen.",
    Icon: UsersRound
  }
];

const workflowItems = [
  "Spielampel setzen",
  "Spieltermin planen",
  "Self-Bondage-Auftrag erteilen",
  "Idee festhalten",
  "Bilder hochladen",
  "Telegram auslösen"
];

const heroStats = [
  { title: "Ampel", text: "Rot oder Grün für die aktuelle Stimmung", Icon: Signal },
  { title: "Kalender", text: "Die nächsten Tage sofort im Blick", Icon: CalendarDays },
  { title: "Agent", text: "Telegram als Gesprächspartner", Icon: MessageSquareText }
];

const trustCards = [
  { title: "Geschützt", text: "Dateien werden nicht offen als statische Pfade ausgeliefert.", Icon: LockKeyhole },
  { title: "Anpassbar", text: "Themes, Dark Mode, Profile und Kreise passen sich dem Benutzer an.", Icon: Palette },
  { title: "Bilderzentriert", text: "Galerien, Ideenbilder und Uploads sind auf schnelles Anschauen ausgelegt.", Icon: Camera }
];

export default async function LoginPage({ searchParams }: { searchParams?: { confirmed?: string; reset?: string } }) {
  const tenant = await currentTenant();
  const tenantName = tenant?.name || "Playplaner";
  const tenantDomain = tenant ? primaryTenantDomain(tenant) : "playplaner.com";
  return (
    <main className="min-h-screen bg-canvas text-ink">
      <section className="relative overflow-hidden border-b border-line bg-surface">
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(227,6,19,0.08),transparent_34%,rgba(14,165,233,0.08))]" />
        <div className="relative mx-auto grid min-h-screen max-w-7xl gap-10 px-5 py-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:px-8">
          <div className="flex flex-col justify-between gap-10">
            <header className="flex items-center justify-between gap-4">
              <div>
                <div className="text-2xl font-semibold tracking-normal">{tenantName}</div>
                <div className="text-sm text-graphite">{tenantDomain}</div>
              </div>
              <a href="#login" className="focus-ring inline-flex min-h-10 items-center gap-2 rounded-md border border-line bg-surface px-4 py-2 text-sm font-semibold hover:bg-paper">
                <LockKeyhole className="h-4 w-4" />
                Login
              </a>
            </header>

            <div className="max-w-3xl py-4">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-redbrand/20 bg-redbrand/10 px-4 py-2 text-sm font-semibold text-redbrand">
                <Sparkles className="h-4 w-4" />
                Private Planung für Paare und Kreise
              </div>
              <h1 className="text-4xl font-semibold tracking-normal text-ink sm:text-5xl lg:text-6xl">
                Alles, was ihr zusammen plant, dokumentiert und wiederfinden wollt.
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-graphite">
                Eine helle, geschützte Plattform für Spielideen, Szenen, Ausrüstung, Bilder, Sessions, Telegram-Automation und gemeinsame Signale.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a href="#login" className="focus-ring inline-flex min-h-12 items-center gap-2 rounded-md bg-redbrand px-5 py-3 text-sm font-semibold text-white shadow-soft hover:bg-redbrandHover">
                  <KeyRound className="h-4 w-4" />
                  Geschützten Bereich öffnen
                </a>
                <a href="#funktionen" className="focus-ring inline-flex min-h-12 items-center gap-2 rounded-md border border-line bg-surface px-5 py-3 text-sm font-semibold hover:bg-paper">
                  <ShieldCheck className="h-4 w-4" />
                  Funktionen ansehen
                </a>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {heroStats.map(({ title, text, Icon }) => (
                <div key={title} className="rounded-lg border border-line bg-paper p-4">
                  <Icon className="mb-3 h-5 w-5 text-redbrand" />
                  <strong className="block text-sm">{title}</strong>
                  <span className="mt-1 block text-sm leading-6 text-graphite">{text}</span>
                </div>
              ))}
            </div>
          </div>

          <Panel id="login" className="mx-auto w-full max-w-md bg-surface/95 backdrop-blur">
            <div className="mb-6">
              <div className="text-2xl font-semibold text-ink">Einloggen</div>
              <p className="mt-1 text-sm leading-6 text-graphite">
                Melde dich mit deinem Benutzerkonto an. Das Passwortfeld hat ein Auge, damit du deine Eingabe kurz prüfen kannst.
              </p>
            </div>
            {searchParams?.confirmed ? <div className="mb-4 rounded-md border border-emerald-500 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-700">E-Mail bestätigt. Du kannst dich jetzt einloggen.</div> : null}
            {searchParams?.reset ? <div className="mb-4 rounded-md border border-emerald-500 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-700">Passwort gespeichert. Du kannst dich jetzt einloggen.</div> : null}
            <LoginForm />
            <div className="mt-4 text-right">
              <a href="/password/forgot" className="focus-ring rounded-md text-sm font-semibold text-redbrand hover:underline">Passwort vergessen?</a>
            </div>
          </Panel>
        </div>
      </section>

      <section id="funktionen" className="mx-auto max-w-7xl px-5 py-14 lg:px-8">
        <div className="mb-8 max-w-3xl">
          <h2 className="text-3xl font-semibold tracking-normal">Funktionen im Überblick</h2>
          <p className="mt-3 text-base leading-7 text-graphite">
            Die Startseite ist bewusst öffentlich, die Inhalte bleiben geschützt. Nach dem Login öffnet sich dein privater Bereich mit den Daten deines Benutzers und Kreises.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {featureCards.map(({ title, text, Icon }) => (
            <div key={title} className="rounded-lg border border-line bg-surface p-5 shadow-soft">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-md bg-redbrand text-white">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-graphite">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-line bg-paper">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-14 lg:grid-cols-[0.85fr_1.15fr] lg:px-8">
          <div>
            <h2 className="text-3xl font-semibold tracking-normal">Vom Impuls zur dokumentierten Session.</h2>
            <p className="mt-3 text-base leading-7 text-graphite">
              Playplaner verbindet spontane Signale, konkrete Planung, Bildmaterial und spätere Auswertung. Die App ist für wiederholte Nutzung gebaut: schnell erfassen, sauber verknüpfen, später wiederfinden.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {workflowItems.map((item, index) => (
              <div key={item} className="flex items-center gap-3 rounded-lg border border-line bg-surface p-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-redbrand text-sm font-semibold text-white">{index + 1}</span>
                <span className="font-medium">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-4 px-5 py-14 md:grid-cols-3 lg:px-8">
        {trustCards.map(({ title, text, Icon }) => (
          <div key={title} className="rounded-lg border border-line bg-surface p-5">
            <Icon className="mb-4 h-6 w-6 text-redbrand" />
            <h3 className="font-semibold">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-graphite">{text}</p>
          </div>
        ))}
      </section>

      <footer className="border-t border-line bg-surface px-5 py-8 text-sm text-graphite">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span>{tenantName} · {tenantDomain}</span>
          <span className="inline-flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-redbrand" />
            Privater Bereich nur nach Anmeldung
          </span>
        </div>
      </footer>
    </main>
  );
}
