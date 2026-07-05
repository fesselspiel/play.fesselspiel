import Link from "next/link";
import type { ReactNode } from "react";
import {
  Bot,
  Briefcase,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Images,
  KeyRound,
  Lightbulb,
  LockKeyhole,
  MessageCircle,
  PanelsTopLeft,
  Pencil,
  ShieldCheck,
  Signal,
  Sparkles,
  Timer,
  ToyBrick,
  UsersRound,
  Workflow
} from "lucide-react";
import { LoginForm } from "@/components/login-form";
import { Panel } from "@/components/ui";
import { savePublicContent } from "@/app/public-content-actions";
import { landingContent as defaultLandingContent } from "@/lib/public-content";
import { PublicFeature, publicFeatures } from "@/lib/public-features";

const icons = {
  Bot,
  Briefcase,
  CalendarDays,
  Images,
  Lightbulb,
  MessageCircle,
  PanelsTopLeft,
  Signal,
  Timer,
  ToyBrick,
  UsersRound,
  Workflow
};

function FeatureIcon({ name, className = "h-5 w-5" }: { name: string; className?: string }) {
  const Icon = icons[name as keyof typeof icons] || Sparkles;
  return <Icon className={className} />;
}

type LandingContent = ReturnType<typeof defaultLandingContent>;

function EditableField({
  editable,
  fieldKey,
  value,
  mode = "text",
  path,
  children
}: {
  editable?: boolean;
  fieldKey: string;
  value: string | string[];
  mode?: "text" | "lines";
  path: string;
  children: ReactNode;
}) {
  if (!editable) return <>{children}</>;
  const textValue = Array.isArray(value) ? value.join("\n") : value;
  return (
    <div className="group relative rounded-md">
      <details className="absolute -left-2 -top-2 z-20">
        <summary className="focus-ring flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-md border border-line bg-surface text-redbrand shadow-soft hover:bg-paper [&::-webkit-details-marker]:hidden">
          <Pencil className="h-4 w-4" />
          <span className="sr-only">Inhalt bearbeiten</span>
        </summary>
        <form action={savePublicContent} className="mt-2 w-[min(88vw,420px)] space-y-3 rounded-lg border border-line bg-surface p-4 shadow-xl">
          <input type="hidden" name="key" value={fieldKey} />
          <input type="hidden" name="path" value={path} />
          <input type="hidden" name="mode" value={mode} />
          <label className="block text-xs font-semibold text-graphite">
            Inhalt bearbeiten
            <textarea name="value" rows={mode === "lines" ? 8 : 4} defaultValue={textValue} className="mt-1 w-full rounded-md border border-line bg-canvas px-3 py-2 text-sm text-ink" />
          </label>
          <button className="inline-flex min-h-9 items-center rounded-md bg-redbrand px-3 py-2 text-sm font-semibold text-white">Speichern</button>
        </form>
      </details>
      {children}
    </div>
  );
}

function PublicHeader({ tenantName, tenantDomain, features = publicFeatures }: { tenantName: string; tenantDomain: string; features?: PublicFeature[] }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/92 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-3 lg:px-8">
        <Link href="/login" className="focus-ring rounded-md">
          <span className="block text-lg font-semibold tracking-normal">{tenantName}</span>
          <span className="block text-xs text-graphite">{tenantDomain}</span>
        </Link>
        <nav className="hidden max-w-3xl items-center gap-1 overflow-x-auto lg:flex">
          {features.slice(0, 8).map((feature) => (
            <Link key={feature.slug} href={`/features/${feature.slug}`} className="focus-ring whitespace-nowrap rounded-md px-3 py-2 text-sm font-semibold text-graphite hover:bg-paper hover:text-ink">
              {feature.navTitle}
            </Link>
          ))}
        </nav>
        <a href="#login" className="focus-ring inline-flex min-h-10 items-center gap-2 rounded-md bg-redbrand px-4 py-2 text-sm font-semibold text-white hover:bg-redbrandHover">
          <LockKeyhole className="h-4 w-4" />
          Login
        </a>
      </div>
      <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-5 pb-3 lg:hidden">
        {features.map((feature) => (
          <Link key={feature.slug} href={`/features/${feature.slug}`} className="focus-ring whitespace-nowrap rounded-md border border-line bg-surface px-3 py-2 text-xs font-semibold text-graphite">
            {feature.navTitle}
          </Link>
        ))}
      </div>
    </header>
  );
}

function LoginPanel({ returnTo, confirmed, reset }: { returnTo?: string; confirmed?: string; reset?: string }) {
  return (
    <Panel id="login" className="w-full bg-surface/95 backdrop-blur">
      <div className="mb-6">
        <div className="text-2xl font-semibold text-ink">Einloggen</div>
        <p className="mt-1 text-sm leading-6 text-graphite">
          Melde dich mit deinem Benutzerkonto an. Das Passwortfeld hat ein Auge, damit du deine Eingabe kurz prüfen kannst.
        </p>
      </div>
      {confirmed ? <div className="mb-4 rounded-md border border-emerald-500 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-700">E-Mail bestätigt. Du kannst dich jetzt einloggen.</div> : null}
      {reset ? <div className="mb-4 rounded-md border border-emerald-500 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-700">Passwort gespeichert. Du kannst dich jetzt einloggen.</div> : null}
      <LoginForm returnTo={returnTo} />
      <div className="mt-4 text-right">
        <a href="/password/forgot" className="focus-ring rounded-md text-sm font-semibold text-redbrand hover:underline">Passwort vergessen?</a>
      </div>
    </Panel>
  );
}

function PhoneMockup({ feature }: { feature: PublicFeature }) {
  const tones = {
    red: "bg-redbrand/10 text-redbrand",
    green: "bg-emerald-100 text-emerald-800",
    blue: "bg-sky-100 text-sky-800",
    neutral: "bg-paper text-graphite"
  };
  return (
    <div className="mx-auto w-full max-w-[320px] rounded-[2.25rem] bg-[linear-gradient(145deg,#111111,#3a3a3a)] p-3 shadow-[0_24px_70px_rgba(17,17,17,0.22)]">
      <div className="relative overflow-hidden rounded-[1.7rem] bg-canvas">
        <div className="absolute inset-x-8 top-0 h-6 rounded-b-2xl bg-ink" />
        <div className="flex items-center justify-between px-5 pb-3 pt-8">
          <div className="text-[10px] font-bold text-ink">9:41</div>
          <div className="flex items-center gap-1">
            <span className="h-2 w-3 rounded-sm bg-ink/80" />
            <span className="h-2 w-2 rounded-full bg-ink/80" />
            <span className="h-2 w-4 rounded-sm bg-redbrand" />
          </div>
        </div>
        <div className="px-4 pb-4">
          <div className="rounded-2xl border border-line bg-surface p-3 shadow-soft">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-graphite">{feature.mockup.title}</div>
                <div className="mt-1 text-xs text-graphite">{feature.mockup.subtitle}</div>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-redbrand text-white shadow-soft">
                <FeatureIcon name={feature.icon} className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-4 rounded-2xl bg-[linear-gradient(135deg,rgba(227,6,19,0.16),rgba(14,165,233,0.12))] p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-redbrand">{feature.eyebrow}</div>
              <div className="mt-1 text-xl font-semibold leading-7">{feature.mockup.primary}</div>
            </div>
          </div>
          <div className="mt-3 space-y-2">
            {feature.mockup.rows.map((row) => (
              <div key={row.label} className="flex items-center justify-between rounded-xl border border-line bg-surface p-3 shadow-[0_6px_18px_rgba(17,17,17,0.04)]">
                <span className="text-xs font-semibold text-graphite">{row.label}</span>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tones[row.tone || "neutral"]}`}>{row.value}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="h-14 rounded-xl border border-line bg-surface p-2">
              <div className="h-2 w-7 rounded-full bg-line" />
              <div className="mt-2 h-2 w-10 rounded-full bg-line/70" />
            </div>
            <div className="flex h-14 items-center justify-center rounded-xl bg-redbrand text-white shadow-soft">
              <FeatureIcon name={feature.icon} className="h-5 w-5" />
            </div>
            <div className="h-14 rounded-xl border border-line bg-surface p-2">
              <div className="h-2 w-7 rounded-full bg-line" />
              <div className="mt-2 h-2 w-10 rounded-full bg-line/70" />
            </div>
          </div>
          <div className="mx-auto mt-4 h-1.5 w-20 rounded-full bg-ink/20" />
        </div>
      </div>
    </div>
  );
}

function FeatureNavGrid({ features = publicFeatures }: { features?: PublicFeature[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {features.map((feature) => (
        <Link key={feature.slug} href={`/features/${feature.slug}`} className="focus-ring group rounded-lg border border-line bg-surface p-5 shadow-soft transition hover:-translate-y-0.5 hover:shadow-lg">
          <div className="mb-4 flex items-center justify-between">
            <span className="flex h-11 w-11 items-center justify-center rounded-md bg-redbrand text-white">
              <FeatureIcon name={feature.icon} />
            </span>
            <ChevronRight className="h-5 w-5 text-graphite transition group-hover:translate-x-1 group-hover:text-redbrand" />
          </div>
          <h3 className="text-lg font-semibold">{feature.title}</h3>
          <p className="mt-2 text-sm leading-6 text-graphite">{feature.summary}</p>
        </Link>
      ))}
    </div>
  );
}

function Walkthrough({ feature }: { feature: PublicFeature }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {feature.walkthrough.map((item, index) => (
        <div key={item} className="flex gap-3 rounded-lg border border-line bg-surface p-4">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-redbrand text-sm font-semibold text-white">{index + 1}</span>
          <div>
            <div className="text-sm font-semibold">Schritt {index + 1}</div>
            <p className="mt-1 text-sm leading-6 text-graphite">{item}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function Footer({ tenantName, tenantDomain }: { tenantName: string; tenantDomain: string }) {
  return (
    <footer className="border-t border-line bg-surface px-5 py-8 text-sm text-graphite">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span>{tenantName} · {tenantDomain}</span>
        <span className="inline-flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-redbrand" />
          Privater Bereich nur nach Anmeldung
        </span>
      </div>
    </footer>
  );
}

export function PublicLandingPage({ tenantName, tenantDomain, confirmed, reset, returnTo, features = publicFeatures, content = defaultLandingContent({}), editable = false }: { tenantName: string; tenantDomain: string; confirmed?: string; reset?: string; returnTo?: string; features?: PublicFeature[]; content?: LandingContent; editable?: boolean }) {
  const primary = features[0] || publicFeatures[0];
  return (
    <main className="min-h-screen bg-canvas text-ink">
      <PublicHeader tenantName={tenantName} tenantDomain={tenantDomain} features={features} />
      <section className="relative overflow-hidden border-b border-line bg-surface">
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(227,6,19,0.08),transparent_34%,rgba(14,165,233,0.08))]" />
        <div className="relative mx-auto grid min-h-[calc(100vh-72px)] max-w-7xl gap-10 px-5 py-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:px-8">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-redbrand/20 bg-redbrand/10 px-4 py-2 text-sm font-semibold text-redbrand">
              <Sparkles className="h-4 w-4" />
              <EditableField editable={editable} fieldKey="landing.heroEyebrow" value={content.heroEyebrow} path="/login">{content.heroEyebrow}</EditableField>
            </div>
            <EditableField editable={editable} fieldKey="landing.heroTitle" value={content.heroTitle} path="/login">
              <h1 className="max-w-4xl text-4xl font-semibold tracking-normal text-ink sm:text-5xl lg:text-6xl">{content.heroTitle}</h1>
            </EditableField>
            <EditableField editable={editable} fieldKey="landing.heroText" value={content.heroText} path="/login">
              <p className="mt-6 max-w-2xl text-lg leading-8 text-graphite">{content.heroText}</p>
            </EditableField>
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
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {features.slice(0, 3).map((feature) => (
                <Link key={feature.slug} href={`/features/${feature.slug}`} className="focus-ring rounded-lg border border-line bg-paper p-4 hover:bg-surface">
                  <FeatureIcon name={feature.icon} className="mb-3 h-5 w-5 text-redbrand" />
                  <strong className="block text-sm">{feature.navTitle}</strong>
                  <span className="mt-1 block text-sm leading-6 text-graphite">{feature.summary}</span>
                </Link>
              ))}
            </div>
          </div>
          <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
            <PhoneMockup feature={primary} />
            <LoginPanel confirmed={confirmed} reset={reset} returnTo={returnTo} />
          </div>
        </div>
      </section>
      <section id="funktionen" className="mx-auto max-w-7xl px-5 py-14 lg:px-8">
        <div className="mb-8 max-w-3xl">
          <EditableField editable={editable} fieldKey="landing.featuresTitle" value={content.featuresTitle} path="/login">
            <h2 className="text-3xl font-semibold tracking-normal">{content.featuresTitle}</h2>
          </EditableField>
          <EditableField editable={editable} fieldKey="landing.featuresText" value={content.featuresText} path="/login">
            <p className="mt-3 text-base leading-7 text-graphite">{content.featuresText}</p>
          </EditableField>
        </div>
        <FeatureNavGrid features={features} />
      </section>
      <section className="border-y border-line bg-paper">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-14 lg:grid-cols-[0.85fr_1.15fr] lg:px-8">
          <div>
            <EditableField editable={editable} fieldKey="landing.workflowTitle" value={content.workflowTitle} path="/login">
              <h2 className="text-3xl font-semibold tracking-normal">{content.workflowTitle}</h2>
            </EditableField>
            <EditableField editable={editable} fieldKey="landing.workflowText" value={content.workflowText} path="/login">
              <p className="mt-3 text-base leading-7 text-graphite">{content.workflowText}</p>
            </EditableField>
          </div>
          <Walkthrough feature={primary} />
        </div>
      </section>
      <Footer tenantName={tenantName} tenantDomain={tenantDomain} />
    </main>
  );
}

export function PublicFeaturePage({ feature, tenantName, tenantDomain, features = publicFeatures, editable = false }: { feature: PublicFeature; tenantName: string; tenantDomain: string; features?: PublicFeature[]; editable?: boolean }) {
  const prefix = `feature.${feature.slug}`;
  const path = `/features/${feature.slug}`;
  return (
    <main className="min-h-screen bg-canvas text-ink">
      <PublicHeader tenantName={tenantName} tenantDomain={tenantDomain} features={features} />
      <section className="relative overflow-hidden border-b border-line bg-surface">
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(227,6,19,0.08),transparent_40%,rgba(14,165,233,0.08))]" />
        <div className="relative mx-auto grid max-w-7xl gap-10 px-5 py-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:px-8">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-redbrand/20 bg-redbrand/10 px-4 py-2 text-sm font-semibold text-redbrand">
              <FeatureIcon name={feature.icon} className="h-4 w-4" />
              <EditableField editable={editable} fieldKey={`${prefix}.eyebrow`} value={feature.eyebrow} path={path}>{feature.eyebrow}</EditableField>
            </div>
            <EditableField editable={editable} fieldKey={`${prefix}.title`} value={feature.title} path={path}>
              <h1 className="max-w-4xl text-4xl font-semibold tracking-normal text-ink sm:text-5xl">{feature.title}</h1>
            </EditableField>
            <EditableField editable={editable} fieldKey={`${prefix}.summary`} value={feature.summary} path={path}>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-graphite">{feature.summary}</p>
            </EditableField>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#login" className="focus-ring inline-flex min-h-12 items-center gap-2 rounded-md bg-redbrand px-5 py-3 text-sm font-semibold text-white shadow-soft hover:bg-redbrandHover">
                <KeyRound className="h-4 w-4" />
                Einloggen
              </a>
              <a href="#walkthrough" className="focus-ring inline-flex min-h-12 items-center gap-2 rounded-md border border-line bg-surface px-5 py-3 text-sm font-semibold hover:bg-paper">
                Walkthrough ansehen
              </a>
            </div>
          </div>
          <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
            <PhoneMockup feature={feature} />
            <LoginPanel returnTo="/" />
          </div>
        </div>
      </section>
      <section className="mx-auto grid max-w-7xl gap-8 px-5 py-14 lg:grid-cols-[1fr_0.9fr] lg:px-8">
        <div>
          <h2 className="text-3xl font-semibold tracking-normal">Was du damit machen kannst</h2>
          <EditableField editable={editable} fieldKey={`${prefix}.description`} value={feature.description} mode="lines" path={path}>
            <div className="mt-5 space-y-4 text-base leading-7 text-graphite">
              {feature.description.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            </div>
          </EditableField>
        </div>
        <EditableField editable={editable} fieldKey={`${prefix}.highlights`} value={feature.highlights} mode="lines" path={path}>
          <div className="grid gap-3 sm:grid-cols-2">
            {feature.highlights.map((highlight) => (
              <div key={highlight} className="rounded-lg border border-line bg-surface p-4 shadow-soft">
                <CheckCircle2 className="mb-3 h-5 w-5 text-redbrand" />
                <div className="font-semibold">{highlight}</div>
              </div>
            ))}
          </div>
        </EditableField>
      </section>
      <section id="walkthrough" className="border-y border-line bg-paper">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-14 lg:grid-cols-[0.8fr_1.2fr] lg:px-8">
          <div>
            <h2 className="text-3xl font-semibold tracking-normal">Walkthrough</h2>
            <p className="mt-3 text-base leading-7 text-graphite">
              So kommst du vom Wunsch zur passenden Aktion. Die echten Buttons erscheinen nach dem Login in deinem geschützten Bereich.
            </p>
          </div>
          <EditableField editable={editable} fieldKey={`${prefix}.walkthrough`} value={feature.walkthrough} mode="lines" path={path}>
            <Walkthrough feature={feature} />
          </EditableField>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-5 py-14 lg:px-8">
        <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h2 className="text-3xl font-semibold tracking-normal">Weitere Bereiche</h2>
            <p className="mt-3 text-base leading-7 text-graphite">Die einzelnen Funktionen greifen ineinander, bleiben aber als Seiten klar getrennt.</p>
          </div>
          <Link href="/login#funktionen" className="focus-ring inline-flex min-h-10 items-center gap-2 rounded-md border border-line bg-surface px-4 py-2 text-sm font-semibold hover:bg-paper">
            Alle Funktionen
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
        <FeatureNavGrid features={features} />
      </section>
      <Footer tenantName={tenantName} tenantDomain={tenantDomain} />
    </main>
  );
}
