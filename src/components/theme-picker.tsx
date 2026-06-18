"use client";

import { useState } from "react";
import type { ThemeId, ThemeMode } from "@/lib/themes";
import { themes } from "@/lib/themes";

export function ThemePicker({ activeTheme, activeMode }: { activeTheme: ThemeId; activeMode: ThemeMode }) {
  const [selected, setSelected] = useState<ThemeId>(activeTheme);
  const [mode, setMode] = useState<ThemeMode>(activeMode);

  function previewTheme(theme: ThemeId) {
    setSelected(theme);
    document.documentElement.dataset.theme = theme;
  }

  function previewMode(enabled: boolean) {
    const nextMode = enabled ? "dark" : "light";
    setMode(nextMode);
    document.documentElement.dataset.mode = nextMode;
  }

  return (
    <div>
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-medium text-graphite">Theme</div>
          <div className="text-xs text-graphite">Farbschema und Dark Mode werden sofort als Vorschau angewendet.</div>
        </div>
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-line bg-surface px-3 py-2">
          <span className="text-sm font-semibold text-ink">Dark Mode</span>
          <span className="relative inline-flex h-7 w-12 shrink-0 items-center">
            <input
              name="darkMode"
              type="checkbox"
              checked={mode === "dark"}
              onChange={(event) => previewMode(event.target.checked)}
              className="peer sr-only"
            />
            <span className="absolute inset-0 rounded-full bg-line transition peer-checked:bg-redbrand" />
            <span className="absolute left-1 h-5 w-5 rounded-full bg-surface shadow transition peer-checked:translate-x-5" />
          </span>
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {themes.map((theme) => (
          <label
            key={theme.id}
            className={`flex cursor-pointer items-center gap-3 rounded-lg border bg-surface p-3 transition hover:bg-paper ${
              selected === theme.id ? "border-redbrand ring-2 ring-redbrand/20" : "border-line"
            }`}
          >
            <input
              name="theme"
              type="radio"
              value={theme.id}
              checked={selected === theme.id}
              onChange={() => previewTheme(theme.id)}
              className="h-4 w-4 shrink-0 accent-redbrand"
            />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-ink">{theme.name}</span>
              <span className="block text-sm text-graphite">{theme.description}</span>
            </span>
            <span className="flex shrink-0 overflow-hidden rounded-md border border-line">
              {(mode === "dark" ? theme.darkSwatches : theme.swatches).map((color) => (
                <span key={color} className="h-8 w-8" style={{ backgroundColor: color }} />
              ))}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
