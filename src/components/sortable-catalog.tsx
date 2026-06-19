"use client";

import Link from "next/link";
import { ChevronDown, GripVertical } from "lucide-react";
import { useState, useTransition } from "react";

type ToyItem = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  positionCount: number;
  activityCount: number;
};

type PositionItem = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  toolCount: number;
  activityCount: number;
  tools: { id: string; title: string; slug: string }[];
};

function DragHandle() {
  return (
    <span className="focus-ring inline-flex h-10 w-10 shrink-0 cursor-grab items-center justify-center rounded-md border border-line bg-surface text-graphite active:cursor-grabbing">
      <GripVertical className="h-5 w-5" />
      <span className="sr-only">Sortieren</span>
    </span>
  );
}

function useReorder<T extends { id: string }>(kind: "toys" | "positions", items: T[]) {
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

  return { ordered, dragId, setDragId, move, isPending };
}

export function SortableToyList({ items }: { items: ToyItem[] }) {
  const { ordered, dragId, setDragId, move, isPending } = useReorder("toys", items);
  return (
    <div className="space-y-3">
      {ordered.map((toy) => (
        <div
          key={toy.id}
          draggable
          onDragStart={() => setDragId(toy.id)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={() => move(toy.id)}
          onDragEnd={() => setDragId(null)}
          className={dragId === toy.id ? "opacity-60" : ""}
        >
          <details className="group overflow-hidden rounded-lg border border-line bg-surface">
            <summary className="flex min-h-20 cursor-pointer list-none items-center gap-3 px-3 py-3 hover:bg-paper [&::-webkit-details-marker]:hidden">
              <DragHandle />
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-paper sm:h-16 sm:w-16">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={toy.imageUrl || "/toy-placeholder.svg"} alt="" className="h-full w-full object-cover" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-base font-semibold text-ink">{toy.title}</h2>
                <div className="mt-1 truncate text-xs font-medium text-redbrand">/toys/{toy.slug}</div>
              </div>
              <ChevronDown className="h-5 w-5 shrink-0 text-graphite transition group-open:rotate-180" />
            </summary>
            <div className="border-t border-line bg-paper p-4">
              <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
                <div className="aspect-[4/3] overflow-hidden rounded-md bg-surface">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={toy.imageUrl || "/toy-placeholder.svg"} alt="" className="h-full w-full object-cover" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-graphite">
                    <span className="rounded-md bg-surface px-2 py-1">/toys/{toy.slug}</span>
                    <span className="rounded-md bg-surface px-2 py-1">{toy.positionCount} Stellungen</span>
                    <span className="rounded-md bg-surface px-2 py-1">{toy.activityCount} Spielplaene</span>
                  </div>
                  <p className="mt-4 text-sm leading-6 text-graphite">{toy.description || "Keine Beschreibung hinterlegt."}</p>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <Link href={`/toys/${toy.slug}`} className="inline-flex min-h-10 items-center rounded-md bg-redbrand px-4 py-2 text-sm font-semibold text-white hover:bg-redbrandHover">
                      Detail oeffnen
                    </Link>
                    <span className="text-xs text-graphite">Detailseite mit QR-Code, Copy-Link, Verknuepfungen und Bearbeitung.</span>
                  </div>
                </div>
              </div>
            </div>
          </details>
        </div>
      ))}
      {isPending ? <p className="text-xs text-graphite">Reihenfolge wird gespeichert ...</p> : null}
    </div>
  );
}

export function SortablePositionList({ items }: { items: PositionItem[] }) {
  const { ordered, dragId, setDragId, move, isPending } = useReorder("positions", items);
  return (
    <div className="space-y-3">
      {ordered.map((position) => (
        <div
          key={position.id}
          draggable
          onDragStart={() => setDragId(position.id)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={() => move(position.id)}
          onDragEnd={() => setDragId(null)}
          className={dragId === position.id ? "opacity-60" : ""}
        >
          <details className="group overflow-hidden rounded-lg border border-line bg-surface">
            <summary className="flex min-h-20 cursor-pointer list-none items-center gap-3 px-3 py-3 hover:bg-paper [&::-webkit-details-marker]:hidden">
              <DragHandle />
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-paper sm:h-16 sm:w-16">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={position.imageUrl || "/position-placeholder.svg"} alt="" className="h-full w-full object-cover" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-base font-semibold text-ink">{position.name}</h2>
                <p className="mt-1 truncate text-xs text-graphite">{position.toolCount} Spielzeuge · {position.activityCount} Spielplaene</p>
              </div>
              <ChevronDown className="h-5 w-5 shrink-0 text-graphite transition group-open:rotate-180" />
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
                    <span className="rounded-md bg-surface px-2 py-1">{position.toolCount} Spielzeuge</span>
                    <span className="rounded-md bg-surface px-2 py-1">{position.activityCount} Spielplaene</span>
                  </div>
                  <p className="mt-4 text-sm leading-6 text-graphite">{position.description || "Keine Beschreibung hinterlegt."}</p>
                  {position.tools.length ? (
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
                      Detail oeffnen
                    </Link>
                    <span className="text-xs text-graphite">Detailseite mit Bild, Verknuepfungen und Bearbeitung.</span>
                  </div>
                </div>
              </div>
            </div>
          </details>
        </div>
      ))}
      {isPending ? <p className="text-xs text-graphite">Reihenfolge wird gespeichert ...</p> : null}
    </div>
  );
}
