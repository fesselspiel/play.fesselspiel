import Link from "next/link";
import { ReactNode } from "react";

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col justify-between gap-4 border-b border-line pb-5 sm:flex-row sm:items-end">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal text-ink sm:text-3xl">
          <Link href="/" className="rounded-md transition hover:text-redbrand focus:outline-none focus:ring-2 focus:ring-redbrand focus:ring-offset-2 focus:ring-offset-canvas">
            {title}
          </Link>
        </h1>
        {subtitle ? <p className="mt-1 max-w-3xl text-sm leading-6 text-graphite">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Panel({ children, className = "", id }: { children: ReactNode; className?: string; id?: string }) {
  return <section id={id} className={`rounded-lg border border-line bg-surface p-5 shadow-soft ${className}`}>{children}</section>;
}

export function SoftPanel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-lg bg-paper p-5 ${className}`}>{children}</section>;
}

export function PageGuide({ children, title = "Kurz erklaert" }: { children: ReactNode; title?: string }) {
  return (
    <details className="order-last mt-10 max-w-full self-end sm:max-w-md">
      <summary className="focus-ring flex min-h-9 cursor-pointer list-none items-center gap-2 rounded-md border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-graphite hover:bg-paper hover:text-ink [&::-webkit-details-marker]:hidden">
        <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-redbrand text-[10px] font-bold text-white">i</span>
        Info
      </summary>
      <div className="mt-2 rounded-lg border border-line bg-surface p-4 text-sm leading-6 text-graphite">
        <h2 className="mb-2 text-sm font-semibold text-ink">{title}</h2>
        <div className="space-y-2">
          <p>{children}</p>
          <p>Nutze die sichtbaren Buttons und Formulare auf dieser Seite von oben nach unten. Aenderungen werden erst gespeichert, wenn du den jeweiligen Speichern- oder Aktionsbutton ausloest.</p>
        </div>
      </div>
    </details>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm font-medium text-graphite">
      <span className="mb-1 block">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  "focus-ring w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-graphite/60";

export const selectClass = `${inputClass} appearance-none`;

export function Button({
  children,
  type = "submit",
  variant = "primary",
  className = "",
  onClick
}: {
  children: ReactNode;
  type?: "button" | "submit";
  variant?: "primary" | "secondary" | "danger";
  className?: string;
  onClick?: () => void;
}) {
  const variants = {
    primary: "bg-redbrand text-white hover:bg-redbrandHover",
    secondary: "border border-line bg-surface text-ink hover:bg-paper",
    danger: "border border-redbrand bg-surface text-redbrand hover:bg-redbrand hover:text-white"
  };
  return (
    <button
      type={type}
      onClick={onClick}
      className={`focus-ring inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "red" | "neutral" | "green" }) {
  const tones = {
    red: "bg-redbrand text-white",
    neutral: "bg-paper text-graphite",
    green: "bg-emerald-50 text-emerald-800"
  };
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line bg-paper p-8 text-center">
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      {children ? <div className="mt-2 text-sm text-graphite">{children}</div> : null}
    </div>
  );
}
