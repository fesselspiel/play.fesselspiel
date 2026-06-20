"use client";

import { Moon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function DarkModeToggle({ active, compact = false }: { active: boolean; compact?: boolean }) {
  const [dark, setDark] = useState(active);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.mode = next ? "dark" : "light";
    startTransition(async () => {
      const response = await fetch("/api/settings/dark-mode", { method: "POST" });
      const payload = (await response.json().catch(() => null)) as { darkMode?: boolean } | null;
      if (typeof payload?.darkMode === "boolean") {
        setDark(payload.darkMode);
        document.documentElement.dataset.mode = payload.darkMode ? "dark" : "light";
      }
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={isPending}
      className={compact
        ? "focus-ring flex h-10 w-16 shrink-0 items-center justify-center rounded-md border border-line bg-surface px-2 text-graphite shadow-soft hover:bg-paper hover:text-redbrand disabled:opacity-70"
        : "flex min-h-10 w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-sm font-medium text-graphite hover:bg-paper hover:text-redbrand disabled:opacity-70"}
      title="Dark Mode"
    >
      <span className={`items-center gap-2 ${compact ? "sr-only" : "inline-flex"}`}>
        <Moon className="h-4 w-4" />
        Dark Mode
      </span>
      <span className={`relative h-6 w-11 rounded-full transition ${dark ? "bg-redbrand" : "bg-line"}`}>
        <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${dark ? "left-6" : "left-1"}`} />
      </span>
    </button>
  );
}
