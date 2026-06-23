"use client";

import { MoveDown, MoveUp } from "lucide-react";
import { useState, useTransition } from "react";

type HomeLayoutItem = {
  key: string;
  label: string;
};

export function SortableHomeLayout({ items }: { items: HomeLayoutItem[] }) {
  const [ordered, setOrdered] = useState(items);
  const [isPending, startTransition] = useTransition();

  function moveBy(key: string, direction: -1 | 1) {
    const from = ordered.findIndex((item) => item.key === key);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= ordered.length) return;
    const next = [...ordered];
    const [entry] = next.splice(from, 1);
    next.splice(to, 0, entry);
    setOrdered(next);
    startTransition(async () => {
      await fetch("/api/settings/home-layout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ keys: next.map((item) => item.key) })
      });
    });
  }

  return (
    <div className="space-y-3">
      <details className="rounded-lg border border-line bg-surface p-4" open>
        <summary className="cursor-pointer list-none text-sm font-semibold text-graphite hover:text-redbrand [&::-webkit-details-marker]:hidden">
          Reihenfolge bearbeiten
        </summary>
        <div className="mt-3 space-y-2">
          {ordered.map((item, index) => (
            <div key={item.key} className="flex items-center gap-2 rounded-md bg-paper p-2">
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{item.label}</span>
              <button type="button" onClick={() => moveBy(item.key, -1)} disabled={index === 0 || isPending} className="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-md border border-line bg-surface disabled:opacity-40">
                <MoveUp className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => moveBy(item.key, 1)} disabled={index === ordered.length - 1 || isPending} className="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-md border border-line bg-surface disabled:opacity-40">
                <MoveDown className="h-4 w-4" />
              </button>
            </div>
          ))}
          {isPending ? <p className="text-xs text-graphite">Reihenfolge wird gespeichert ...</p> : null}
        </div>
      </details>
    </div>
  );
}
