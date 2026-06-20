"use client";

import { useState } from "react";
import { Field, inputClass, selectClass } from "@/components/ui";

type StatusOption = {
  value: string;
  label: string;
};

export function SelfBondageScheduleFields({
  mode,
  defaultDate = "",
  defaultTime = "20:00",
  defaultPlannedAt = "",
  defaultWithoutSchedule,
  statusDefault,
  statusOptions,
  timeOptions
}: {
  mode: "new" | "edit";
  defaultDate?: string;
  defaultTime?: string;
  defaultPlannedAt?: string;
  defaultWithoutSchedule: boolean;
  statusDefault: string;
  statusOptions: StatusOption[];
  timeOptions?: StatusOption[];
}) {
  const [withoutSchedule, setWithoutSchedule] = useState(defaultWithoutSchedule);

  return (
    <div className="space-y-3">
      <label className="flex items-start gap-3 rounded-md border border-line bg-paper p-3 text-sm text-graphite">
        <input
          name="noSchedule"
          type="checkbox"
          checked={withoutSchedule}
          onChange={(event) => setWithoutSchedule(event.currentTarget.checked)}
          className="mt-1 h-4 w-4 accent-redbrand"
        />
        <span>
          <strong className="block text-ink">Ohne Datum/Uhrzeit</strong>
          <span>Der Auftrag gilt sofort, sobald er gesehen wird.</span>
        </span>
      </label>

      <div className={`grid gap-4 ${mode === "new" ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
        {!withoutSchedule && mode === "new" ? (
          <>
            <Field label="Datum"><input className={inputClass} name="date" type="date" defaultValue={defaultDate} /></Field>
            <Field label="Uhrzeit">
              <select className={selectClass} name="time" defaultValue={defaultTime}>
                {(timeOptions || []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </Field>
          </>
        ) : null}

        {!withoutSchedule && mode === "edit" ? (
          <Field label="Datum und Uhrzeit"><input className={inputClass} name="plannedAt" type="datetime-local" step={900} defaultValue={defaultPlannedAt} /></Field>
        ) : null}

        <Field label="Status">
          <select className={selectClass} name="status" defaultValue={statusDefault}>
            {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </Field>
      </div>
    </div>
  );
}
