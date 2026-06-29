"use client";

import Link from "next/link";
import { ChevronDown, MoveDown, MoveUp, Pencil, Star } from "lucide-react";
import { useState, useTransition } from "react";

type ToyItem = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  positionCount: number;
  activityCount: number;
  favoriteCount?: number;
  favoriteNames?: string[];
  isFavorite?: boolean;
};

type PositionItem = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  selfBondageCapable: boolean;
  toolCount: number;
  activityCount: number;
  tools: { id: string; title: string; slug: string }[];
  favoriteCount?: number;
  favoriteNames?: string[];
  isFavorite?: boolean;
};

type BondageSystemItem = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  vendor: string | null;
  positionCount: number;
  activityCount: number;
  inTagFilter: boolean;
};

function useReorder<T extends { id: string }>(kind: "toys" | "positions" | "bondageSystem", items: T[]) {
  const [ordered, setOrdered] = useState(items);
  const [dragId, setDragId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function move(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const from = ordered.findIndex((item) => item.id === dragId);
    const to = ordered.findIndex((item) => item.id === targetId);
    if (from < 0 || to < 0) return;
    const next = [...ordered];
    const [entry] = next.splice(from, 1);
    next.splice(to, 0, entry);
    setOrdered(next);
    startTransition(async () => {
      await fetch("/api/reorder", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, ids: next.map((item) => item.id) })
      });
    });
  }
  function moveBy(id: string, direction: -1 | 1) {
    const from = ordered.findIndex((item) => item.id === id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= ordered.length) return;
    const next = [...ordered];
    const [entry] = next.splice(from, 1);
    next.splice(to, 0, entry);
    setOrdered(next);
    startTransition(async () => {
      await fetch("/api/reorder", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, ids: next.map((item) => item.id) })
      });
    });
  }

  return { ordered, dragId, setDragId, move, moveBy, isPending };
}

function FavoriteButton({ kind, id, initialFavorite }: { kind: "toy" | "position"; id: string; initialFavorite?: boolean }) {
  const [isFavorite, setIsFavorite] = useState(Boolean(initialFavorite));
  const [isPending, startTransition] = useTransition();

  function toggleFavorite() {
    startTransition(async () => {
      const response = await fetch("/api/favorites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, id })
      });
      if (!response.ok) return;
      const data = await response.json().catch(() => null) as { isFavorite?: boolean } | null;
      setIsFavorite(Boolean(data?.isFavorite));
    });
  }

  return (
    <button
      type="button"
      onClick={toggleFavorite}
      disabled={isPending}
      className={`focus-ring inline-flex min-h-10 items-center gap-2 rounded-md border border-line px-4 py-2 text-sm font-semibold transition disabled:cursor-wait disabled:opacity-70 ${isFavorite ? "bg-redbrand text-white hover:bg-redbrandHover" : "bg-surface text-ink hover:bg-paper"}`}
    >
      <Star className="h-4 w-4" />
      {isPending ? "Wird gespeichert..." : isFavorite ? "Favorit" : "Als Favorit markieren"}
    </button>
  );
}

export function SortableToyList({ items, canSort = false }: { items: ToyItem[]; canSort?: boolean }) {
  const { ordered, dragId, setDragId, move, moveBy, isPending } = useReorder("toys", items);
  return (
    <div className="space-y-3">
      {ordered.map((toy) => (
        <div
          key={toy.id}
          draggable={false}
          onDragStart={() => setDragId(toy.id)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={() => move(toy.id)}
          onDragEnd={() => setDragId(null)}
          className={dragId === toy.id ? "opacity-60" : ""}
        >
          <details className="group/toy-card overflow-hidden rounded-lg border border-line bg-surface">
            <summary className="flex min-h-20 cursor-pointer list-none items-center gap-3 px-3 py-3 hover:bg-paper [&::-webkit-details-marker]:hidden">
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-paper sm:h-16 sm:w-16">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={toy.imageUrl || "/toy-placeholder.svg"} alt="" className="h-full w-full object-cover" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-base font-semibold text-ink">{toy.title}</h2>
                <p className="mt-1 truncate text-xs text-graphite">
                  {toy.positionCount} Szenen · {toy.activityCount} Spielpläne
                  {toy.favoriteCount ? ` · ${toy.favoriteCount} Favorit${toy.favoriteCount === 1 ? "" : "en"}` : ""}
                </p>
              </div>
              <ChevronDown className="h-5 w-5 shrink-0 text-graphite transition group-open/toy-card:rotate-180" />
            </summary>
            <div className="border-t border-line bg-paper p-4">
              <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
                <div className="aspect-[4/3] overflow-hidden rounded-md bg-surface">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={toy.imageUrl || "/toy-placeholder.svg"} alt="" className="h-full w-full object-cover" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-graphite">
                    <span className="rounded-md bg-surface px-2 py-1">{toy.positionCount} Szenen</span>
                    <span className="rounded-md bg-surface px-2 py-1">{toy.activityCount} Spielpläne</span>
                  {toy.isFavorite ? <span className="rounded-md bg-redbrand px-2 py-1 text-white">Favorit</span> : null}
                  {toy.favoriteCount ? <span className="rounded-md bg-surface px-2 py-1">{toy.favoriteCount} Favorit{toy.favoriteCount === 1 ? "" : "en"}</span> : null}
                  </div>
                  {toy.favoriteNames?.length ? (
                    <p className="mt-3 text-xs text-graphite">Favorisiert von {toy.favoriteNames.join(", ")}</p>
                  ) : null}
                  <p className="mt-4 text-sm leading-6 text-graphite">{toy.description || "Keine Beschreibung hinterlegt."}</p>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <Link href={`/toys/${toy.slug}`} className="inline-flex min-h-10 items-center rounded-md bg-redbrand px-4 py-2 text-sm font-semibold text-white hover:bg-redbrandHover">
                      Detail öffnen
                    </Link>
                    <Link href={`/toys/${toy.slug}/edit`} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink hover:bg-paper">
                      <Pencil className="h-4 w-4" />
                      Bearbeiten
                    </Link>
                    <FavoriteButton kind="toy" id={toy.id} initialFavorite={toy.isFavorite} />
                    <span className="text-xs text-graphite">Direkt bearbeiten oder als Favorit markieren. Details bleiben für QR-Code, Copy-Link und Verknüpfungen verfügbar.</span>
                  </div>
                </div>
              </div>
            </div>
          </details>
        </div>
      ))}
      {canSort ? (
        <details className="rounded-lg border border-line bg-surface p-4">
          <summary className="cursor-pointer list-none text-sm font-semibold text-graphite hover:text-redbrand [&::-webkit-details-marker]:hidden">
            Reihenfolge bearbeiten
          </summary>
          <div className="mt-3 space-y-2">
            {ordered.map((toy, index) => (
              <div key={toy.id} className="flex items-center gap-2 rounded-md bg-paper p-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{toy.title}</span>
                <button type="button" onClick={() => moveBy(toy.id, -1)} disabled={index === 0} className="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-md border border-line bg-surface disabled:opacity-40">
                  <MoveUp className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => moveBy(toy.id, 1)} disabled={index === ordered.length - 1} className="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-md border border-line bg-surface disabled:opacity-40">
                  <MoveDown className="h-4 w-4" />
                </button>
              </div>
            ))}
            {isPending ? <p className="text-xs text-graphite">Reihenfolge wird gespeichert ...</p> : null}
          </div>
        </details>
      ) : null}
      {isPending ? <p className="text-xs text-graphite">Reihenfolge wird gespeichert ...</p> : null}
    </div>
  );
}

export function SortablePositionList({ items, canSort = false, showTools = true }: { items: PositionItem[]; canSort?: boolean; showTools?: boolean }) {
  const { ordered, dragId, setDragId, move, moveBy, isPending } = useReorder("positions", items);
  return (
    <div className="space-y-3">
      {ordered.map((position) => (
        <div
          key={position.id}
          draggable={false}
          onDragStart={() => setDragId(position.id)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={() => move(position.id)}
          onDragEnd={() => setDragId(null)}
          className={dragId === position.id ? "opacity-60" : ""}
        >
          <details className="group/position-card overflow-hidden rounded-lg border border-line bg-surface">
            <summary className="flex min-h-20 cursor-pointer list-none items-center gap-3 px-3 py-3 hover:bg-paper [&::-webkit-details-marker]:hidden">
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-paper sm:h-16 sm:w-16">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={position.imageUrl || "/position-placeholder.svg"} alt="" className="h-full w-full object-cover" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-base font-semibold text-ink">{position.name}</h2>
                <p className="mt-1 truncate text-xs text-graphite">
                  {showTools ? `${position.toolCount} Spielzeuge · ` : ""}{position.activityCount} Spielpläne
                  {position.selfBondageCapable ? " · Self-Bondage" : ""}
                  {position.favoriteCount ? ` · ${position.favoriteCount} Favorit${position.favoriteCount === 1 ? "" : "en"}` : ""}
                </p>
              </div>
              <ChevronDown className="h-5 w-5 shrink-0 text-graphite transition group-open/position-card:rotate-180" />
            </summary>
            <div className="border-t border-line bg-paper p-4">
              <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
                <div className="aspect-[4/3] overflow-hidden rounded-md bg-surface">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={position.imageUrl || "/position-placeholder.svg"} alt="" className="h-full w-full object-cover" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-graphite">
                    <span className="rounded-md bg-surface px-2 py-1">/positions/{position.slug}</span>
                    {showTools ? <span className="rounded-md bg-surface px-2 py-1">{position.toolCount} Spielzeuge</span> : null}
                    <span className="rounded-md bg-surface px-2 py-1">{position.activityCount} Spielpläne</span>
                    {position.isFavorite ? <span className="rounded-md bg-redbrand px-2 py-1 text-white">Favorit</span> : null}
                    {position.favoriteCount ? <span className="rounded-md bg-surface px-2 py-1">{position.favoriteCount} Favorit{position.favoriteCount === 1 ? "" : "en"}</span> : null}
                    <span className={`rounded-md px-2 py-1 ${position.selfBondageCapable ? "bg-redbrand text-white" : "bg-surface text-graphite"}`}>
                      {position.selfBondageCapable ? "Self-Bondage-fähig" : "Nicht als Self-Bondage-fähig markiert"}
                    </span>
                  </div>
                  {position.favoriteNames?.length ? (
                    <p className="mt-3 text-xs text-graphite">Favorisiert von {position.favoriteNames.join(", ")}</p>
                  ) : null}
                  <p className="mt-4 text-sm leading-6 text-graphite">{position.description || "Keine Beschreibung hinterlegt."}</p>
                  {showTools && position.tools.length ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {position.tools.slice(0, 6).map((tool) => (
                        <Link key={tool.id} href={`/toys/${tool.slug}`} className="rounded-md bg-surface px-2 py-1 text-xs font-medium text-graphite hover:text-redbrand">
                          {tool.title}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <Link href={`/positions/${position.slug}`} className="inline-flex min-h-10 items-center rounded-md bg-redbrand px-4 py-2 text-sm font-semibold text-white hover:bg-redbrandHover">
                      Detail öffnen
                    </Link>
                    <Link href={`/positions/${position.slug}/edit`} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink hover:bg-paper">
                      <Pencil className="h-4 w-4" />
                      Bearbeiten
                    </Link>
                    <FavoriteButton kind="position" id={position.id} initialFavorite={position.isFavorite} />
                    <span className="text-xs text-graphite">Direkt bearbeiten oder als Favorit markieren. Details bleiben für Bild und Verknüpfungen verfügbar.</span>
                  </div>
                </div>
              </div>
            </div>
          </details>
        </div>
      ))}
      {canSort ? (
        <details className="rounded-lg border border-line bg-surface p-4">
          <summary className="cursor-pointer list-none text-sm font-semibold text-graphite hover:text-redbrand [&::-webkit-details-marker]:hidden">
            Reihenfolge bearbeiten
          </summary>
          <div className="mt-3 space-y-2">
            {ordered.map((position, index) => (
              <div key={position.id} className="flex items-center gap-2 rounded-md bg-paper p-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{position.name}</span>
                <button type="button" onClick={() => moveBy(position.id, -1)} disabled={index === 0} className="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-md border border-line bg-surface disabled:opacity-40">
                  <MoveUp className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => moveBy(position.id, 1)} disabled={index === ordered.length - 1} className="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-md border border-line bg-surface disabled:opacity-40">
                  <MoveDown className="h-4 w-4" />
                </button>
              </div>
            ))}
            {isPending ? <p className="text-xs text-graphite">Reihenfolge wird gespeichert ...</p> : null}
          </div>
        </details>
      ) : null}
      {isPending ? <p className="text-xs text-graphite">Reihenfolge wird gespeichert ...</p> : null}
    </div>
  );
}

export function SortableBondageSystemList({ items, canSort = false }: { items: BondageSystemItem[]; canSort?: boolean }) {
  const { ordered, moveBy, isPending } = useReorder("bondageSystem", items);
  return (
    <div className="space-y-3">
      {ordered.map((item) => (
        <details key={item.id} className="group/bondage-card overflow-hidden rounded-lg border border-line bg-surface">
          <summary className="flex min-h-20 cursor-pointer list-none items-center gap-3 px-3 py-3 hover:bg-paper [&::-webkit-details-marker]:hidden">
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-paper sm:h-16 sm:w-16">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.imageUrl || "/toy-placeholder.svg"} alt="" className="block h-full w-full max-w-full object-contain" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-base font-semibold text-ink">{item.title}</h2>
              <p className="mt-1 truncate text-xs text-graphite">
                {item.positionCount} Szenen · {item.activityCount} Spielpläne · {item.vendor || "Shopify"}
              </p>
            </div>
            <ChevronDown className="h-5 w-5 shrink-0 text-graphite transition group-open/bondage-card:rotate-180" />
          </summary>
          <div className="border-t border-line bg-paper p-4">
            <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
              <div className="flex h-56 max-h-56 items-center justify-center overflow-hidden rounded-md bg-surface">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.imageUrl || "/toy-placeholder.svg"} alt="" className="block h-full w-full max-w-full object-contain" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-graphite">
                  <span className="rounded-md bg-surface px-2 py-1">{item.positionCount} Szenen</span>
                  <span className="rounded-md bg-surface px-2 py-1">{item.activityCount} Spielpläne</span>
                  {!item.inTagFilter ? <span className="rounded-md bg-surface px-2 py-1">nicht mehr im Shopify-Filter</span> : null}
                </div>
                <p className="mt-4 line-clamp-5 text-sm leading-6 text-graphite">{item.description || "Keine Beschreibung von Shopify erhalten."}</p>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Link href={`/bondage-system/${item.slug}`} className="inline-flex min-h-10 items-center rounded-md bg-redbrand px-4 py-2 text-sm font-semibold text-white hover:bg-redbrandHover">
                    Detail öffnen
                  </Link>
                  <span className="text-xs text-graphite">Detailseite mit Shopify-Beschreibung, Bild und Verknüpfungen.</span>
                </div>
              </div>
            </div>
          </div>
        </details>
      ))}
      {canSort ? (
        <details className="rounded-lg border border-line bg-surface p-4">
          <summary className="cursor-pointer list-none text-sm font-semibold text-graphite hover:text-redbrand [&::-webkit-details-marker]:hidden">
            Reihenfolge bearbeiten
          </summary>
          <div className="mt-3 space-y-2">
            {ordered.map((item, index) => (
              <div key={item.id} className="flex items-center gap-2 rounded-md bg-paper p-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{item.title}</span>
                <button type="button" onClick={() => moveBy(item.id, -1)} disabled={index === 0} className="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-md border border-line bg-surface disabled:opacity-40">
                  <MoveUp className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => moveBy(item.id, 1)} disabled={index === ordered.length - 1} className="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-md border border-line bg-surface disabled:opacity-40">
                  <MoveDown className="h-4 w-4" />
                </button>
              </div>
            ))}
            {isPending ? <p className="text-xs text-graphite">Reihenfolge wird gespeichert ...</p> : null}
          </div>
        </details>
      ) : null}
    </div>
  );
}
