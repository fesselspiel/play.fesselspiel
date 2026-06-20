"use client";

import { useState } from "react";
import { inputClass } from "@/components/ui";

type PositionOption = {
  id: string;
  name: string;
};

export function SelfBondagePositionChoice({
  positions,
  defaultChoice = "",
  defaultCustomText = "",
  error
}: {
  positions: PositionOption[];
  defaultChoice?: string;
  defaultCustomText?: string;
  error?: string;
}) {
  const [choice, setChoice] = useState(defaultChoice);

  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold text-graphite">Auftragsszene</h2>
      {error ? <p className="mb-3 rounded-md border border-redbrand/30 bg-redbrand/10 p-3 text-sm font-semibold text-redbrand">{error}</p> : null}
      <div className="space-y-2">
        {positions.map((position) => (
          <label key={position.id} className="flex items-center gap-3 rounded-md bg-paper p-3 text-sm">
            <input
              name="selfBondageChoice"
              value={`position:${position.id}`}
              type="radio"
              required
              checked={choice === `position:${position.id}`}
              onChange={(event) => setChoice(event.currentTarget.value)}
              className="h-4 w-4 accent-redbrand"
            />
            <span className="min-w-0">
              <span className="block font-medium">{position.name}</span>
              <span className="block text-xs text-sky-700">Self-Bondage-fähig</span>
            </span>
          </label>
        ))}
        <label className="block rounded-md bg-paper p-3 text-sm">
          <span className="flex items-center gap-3">
            <input
              name="selfBondageChoice"
              value="custom"
              type="radio"
              required
              checked={choice === "custom"}
              onChange={(event) => setChoice(event.currentTarget.value)}
              className="h-4 w-4 accent-redbrand"
            />
            <span className="font-medium">Freitext statt Szene</span>
          </span>
          {choice === "custom" ? (
            <textarea className={`${inputClass} mt-3`} name="selfBondageCustomText" rows={4} defaultValue={defaultCustomText} required placeholder="Beschreibe die gewünschte Lage oder Aufgabe." />
          ) : null}
        </label>
        <label className="flex items-start gap-3 rounded-md bg-paper p-3 text-sm">
          <input
            name="selfBondageChoice"
            value="surprise"
            type="radio"
            required
            checked={choice === "surprise"}
            onChange={(event) => setChoice(event.currentTarget.value)}
            className="mt-1 h-4 w-4 accent-redbrand"
          />
          <span>
            <span className="block font-medium">Denk dir was aus</span>
            <span className="block text-xs text-graphite">Der Auftrag erlaubt eine beliebige passende Self-Bondage-Szene.</span>
          </span>
        </label>
        {!positions.length ? (
          <p className="rounded-md bg-paper p-3 text-sm text-graphite">Es gibt noch keine Szene mit dem Feld „Self-Bondage-fähig“. Nutze Freitext oder „Denk dir was aus“.</p>
        ) : null}
      </div>
    </section>
  );
}
