"use client";

import { useMemo, useState } from "react";
import { selectClass } from "@/components/ui";

type SourceToy = {
  id: string;
  title: string;
  categoryName: string;
};

type SourcePosition = {
  id: string;
  name: string;
  categoryName: string;
  toolCount: number;
};

export type CatalogCopySource = {
  id: string;
  name: string;
  toyCount: number;
  positionCount: number;
  toys: SourceToy[];
  positions: SourcePosition[];
};

export function TenantCatalogCopyPicker({ sources }: { sources: CatalogCopySource[] }) {
  const [sourceId, setSourceId] = useState(sources[0]?.id || "");
  const [toyIds, setToyIds] = useState<Set<string>>(new Set());
  const [positionIds, setPositionIds] = useState<Set<string>>(new Set());
  const source = useMemo(() => sources.find((entry) => entry.id === sourceId) || sources[0], [sourceId, sources]);

  function toggle(setter: (value: Set<string>) => void, current: Set<string>, id: string) {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setter(next);
  }

  function selectAll(kind: "toy" | "position", checked: boolean) {
    if (!source) return;
    if (kind === "toy") setToyIds(checked ? new Set(source.toys.map((toy) => toy.id)) : new Set());
    else setPositionIds(checked ? new Set(source.positions.map((position) => position.id)) : new Set());
  }

  if (!sources.length) {
    return <p className="text-sm text-graphite">Es gibt noch keine andere Seite als Quelle.</p>;
  }

  return (
    <div className="space-y-4">
      <label className="block text-sm font-medium text-graphite">
        <span className="mb-1 block">Quelle</span>
        <select
          className={selectClass}
          name="sourceTenantId"
          value={sourceId}
          onChange={(event) => {
            setSourceId(event.target.value);
            setToyIds(new Set());
            setPositionIds(new Set());
          }}
          required
        >
          {sources.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name} ({entry.positionCount} Szenen, {entry.toyCount} Spielsachen)
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm font-medium text-graphite">
        <span className="mb-1 block">Übernahme</span>
        <select className={selectClass} name="copyMode" defaultValue="missing">
          <option value="missing">Nur fehlende Einträge kopieren</option>
          <option value="refresh">Bereits übernommene Einträge aus der Quelle aktualisieren</option>
          <option value="duplicate">Auswahl als neue Kopie anlegen</option>
        </select>
      </label>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-md border border-line bg-surface p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h4 className="font-semibold text-ink">Szenen</h4>
            <button type="button" className="text-xs font-semibold text-redbrand hover:underline" onClick={() => selectAll("position", positionIds.size !== (source?.positions.length || 0))}>
              {positionIds.size === (source?.positions.length || 0) ? "Alle abwählen" : "Alle auswählen"}
            </button>
          </div>
          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {source?.positions.map((position) => (
              <label key={position.id} className="flex items-center gap-3 rounded-md border border-line bg-paper p-3 text-sm">
                <input
                  name="positionIds"
                  value={position.id}
                  type="checkbox"
                  checked={positionIds.has(position.id)}
                  onChange={() => toggle(setPositionIds, positionIds, position.id)}
                  className="h-5 w-5 accent-redbrand"
                />
                <span>
                  <strong className="block text-ink">{position.name}</strong>
                  <span className="text-xs text-graphite">{position.categoryName} · {position.toolCount} Spielsachen verknüpft</span>
                </span>
              </label>
            ))}
            {!source?.positions.length ? <p className="rounded-md bg-paper p-3 text-sm text-graphite">Keine Szenen vorhanden.</p> : null}
          </div>
        </section>

        <section className="rounded-md border border-line bg-surface p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h4 className="font-semibold text-ink">Spielsachen</h4>
            <button type="button" className="text-xs font-semibold text-redbrand hover:underline" onClick={() => selectAll("toy", toyIds.size !== (source?.toys.length || 0))}>
              {toyIds.size === (source?.toys.length || 0) ? "Alle abwählen" : "Alle auswählen"}
            </button>
          </div>
          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {source?.toys.map((toy) => (
              <label key={toy.id} className="flex items-center gap-3 rounded-md border border-line bg-paper p-3 text-sm">
                <input
                  name="toyIds"
                  value={toy.id}
                  type="checkbox"
                  checked={toyIds.has(toy.id)}
                  onChange={() => toggle(setToyIds, toyIds, toy.id)}
                  className="h-5 w-5 accent-redbrand"
                />
                <span>
                  <strong className="block text-ink">{toy.title}</strong>
                  <span className="text-xs text-graphite">{toy.categoryName}</span>
                </span>
              </label>
            ))}
            {!source?.toys.length ? <p className="rounded-md bg-paper p-3 text-sm text-graphite">Keine Spielsachen vorhanden.</p> : null}
          </div>
        </section>
      </div>

      <p className="text-xs leading-5 text-graphite">
        Tipp: Wenn du Szenen auswählst, werden dafür benötigte verknüpfte Spielsachen automatisch mit übernommen.
      </p>
    </div>
  );
}
