"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Clock, Play, Shuffle } from "lucide-react";
import {
  labelAutomationValue,
  simulateAutomationSessionTimeline,
  type AutomationSessionSimulationRule
} from "@/lib/automation-rule-model";

type CapabilityOption = {
  id: string;
  kind: "Camera" | "Switch" | "Voice";
  title: string;
  deviceName: string;
  deviceId: string;
  state: string;
};

type DeviceOption = { id: string; name: string; health: string };

function MomentBox({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div className="rounded-md border border-line bg-paper p-3">
      <div className="font-semibold text-ink">{title}</div>
      <div className="mt-2 space-y-1 text-sm text-graphite">
        {items.length ? items.map((item, index) => <div key={`${item}-${index}`}>{item}</div>) : <div>{empty}</div>}
      </div>
    </div>
  );
}

export function AutomationSessionSimulator({
  rules,
  capabilities,
  devices
}: {
  rules: AutomationSessionSimulationRule[];
  capabilities: CapabilityOption[];
  devices: DeviceOption[];
}) {
  const [randomSeed, setRandomSeed] = useState(3);
  const simulation = useMemo(() => simulateAutomationSessionTimeline(rules, { capabilities, devices }, randomSeed), [rules, capabilities, devices, randomSeed]);
  const [minute, setMinute] = useState(0);
  const currentMinute = Math.min(minute, simulation.durationMinutes);
  const happened = simulation.timeline.filter((item) => item.minute < currentMinute).map((item) => `Minute ${item.minute}: ${item.title}`);
  const now = simulation.timeline.filter((item) => item.minute === currentMinute).map((item) => item.title);
  const upcoming = simulation.timeline.filter((item) => item.minute > currentMinute).map((item) => `Minute ${item.minute}: ${item.title}`);
  const sessionFinished = simulation.timeline.some((item) => item.kind === "event" && item.title === "Session wurde beendet" && item.minute <= currentMinute);

  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-ink">Gesamte Session simulieren</h3>
          <p className="mt-1 text-sm text-graphite">Spielt alle aktiven Regeln innerhalb genau einer simulierten Session gemeinsam durch. Jede echte Session besitzt eine eigene eindeutige Zuordnung; Geräte werden hier nicht wirklich geschaltet.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setRandomSeed((value) => value + 1);
            setMinute(0);
          }}
          className="inline-flex min-h-10 items-center gap-2 rounded-md border border-line bg-paper px-3 py-2 text-sm font-semibold text-ink hover:border-redbrand hover:text-redbrand"
        >
          <Shuffle className="h-4 w-4" /> Zufall neu auslosen
        </button>
      </div>

      {simulation.randomValues.length ? (
        <div className="mt-3 rounded-md border border-redbrand/30 bg-redbrand/5 p-3 text-sm text-ink">
          {simulation.randomValues.map((item) => <div key={item.rule}><span className="font-semibold">{item.rule}:</span> {item.value}</div>)}
        </div>
      ) : null}

      <input className="mt-4 w-full accent-redbrand" type="range" min={0} max={simulation.durationMinutes} value={currentMinute} onChange={(event) => setMinute(Number(event.target.value))} />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm text-graphite">
        <span>Momentaufnahme: Minute {currentMinute}</span>
        <span className="inline-flex items-center gap-1 font-semibold text-ink">{sessionFinished ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Clock className="h-4 w-4 text-amber-600" />} Session: {labelAutomationValue("states", sessionFinished ? "FINISHED" : "RUNNING")}</span>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-3">
        <MomentBox title="Bereits passiert" items={happened.slice(-6)} empty="Noch nichts passiert." />
        <MomentBox title="Jetzt" items={now} empty="In dieser Minute geschieht nichts Neues." />
        <MomentBox title="Als Nächstes" items={upcoming.slice(0, 6)} empty="Der Ablauf ist abgeschlossen." />
      </div>

      <div className="mt-4 overflow-x-auto pb-2">
        <div className="flex min-w-max items-stretch gap-2">
          {simulation.timeline.map((item, index) => (
            <button
              type="button"
              onClick={() => setMinute(item.minute)}
              key={`${item.minute}-${item.kind}-${item.title}-${index}`}
              className={`w-52 rounded-md border p-3 text-left text-sm ${item.minute <= currentMinute ? "border-redbrand/40 bg-redbrand/10 text-ink" : "border-line bg-paper text-graphite"}`}
            >
              <div className="flex items-center gap-1 text-xs font-semibold uppercase"><Play className="h-3 w-3" /> Minute {item.minute}</div>
              <div className="mt-1 font-semibold">{item.title}</div>
              {item.detail ? <div className="mt-2 text-xs">{item.detail}</div> : null}
            </button>
          ))}
        </div>
      </div>
      {simulation.truncated ? <p className="mt-2 text-sm font-semibold text-redbrand">Die Simulation wurde wegen einer möglichen Regelschleife begrenzt.</p> : null}
    </div>
  );
}
