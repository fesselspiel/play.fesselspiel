"use client";

import { useState } from "react";
import type { ThemeId } from "@/lib/themes";
import { themes } from "@/lib/themes";

export function ThemePicker({ activeTheme }: { activeTheme: ThemeId }) {
  const [selected, setSelected] = useState<ThemeId>(activeTheme);

  function previewTheme(theme: ThemeId) {
    setSelected(theme);
    document.documentElement.dataset.theme = theme;
  }

  return (
    <div>
      <div className="mb-2 text-sm font-medium text-graphite">Theme</div>
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
              {theme.swatches.map((color) => (
                <span key={color} className="h-8 w-8" style={{ backgroundColor: color }} />
              ))}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
