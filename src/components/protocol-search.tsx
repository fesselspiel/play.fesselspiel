"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";

type Suggestion = {
  id: string;
  title: string;
  actor: string;
  body: string;
};

export function ProtocolSearch({ suggestions }: { suggestions: Suggestion[] }) {
  const [query, setQuery] = useState("");
  const matches = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (value.length < 2) return [];
    return suggestions
      .filter((entry) => `${entry.title} ${entry.actor} ${entry.body}`.toLowerCase().includes(value))
      .slice(0, 8);
  }, [query, suggestions]);

  return (
    <div className="relative rounded-lg border border-line bg-surface p-3 shadow-soft">
      <label className="flex items-center gap-3">
        <Search className="h-5 w-5 text-redbrand" />
        <input
          className="min-h-10 flex-1 bg-transparent text-sm outline-none placeholder:text-graphite/60"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder="Protokoll durchsuchen und direkt zum Eintrag springen..."
        />
      </label>
      {matches.length ? (
        <div className="absolute left-3 right-3 top-full z-20 mt-2 overflow-hidden rounded-lg border border-line bg-surface shadow-soft">
          {matches.map((entry) => (
            <a
              key={entry.id}
              href={`#entry-${entry.id}`}
              onClick={() => setQuery("")}
              className="block border-b border-line px-3 py-2 text-sm last:border-b-0 hover:bg-paper"
            >
              <span className="block font-semibold text-ink">{entry.title}</span>
              <span className="block truncate text-xs text-graphite">{entry.actor} · {entry.body || "ohne Detailtext"}</span>
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}
