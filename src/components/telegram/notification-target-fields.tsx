"use client";

import { useState } from "react";
import { Field, selectClass } from "@/components/ui";

type TargetUser = {
  id: string;
  label: string;
};

type TargetCircle = {
  id: string;
  name: string;
};

export function NotificationTargetFields({
  users,
  circles,
  targetType = "none",
  targetUserId = "",
  targetCircleId = ""
}: {
  users: TargetUser[];
  circles: TargetCircle[];
  targetType?: string;
  targetUserId?: string | null;
  targetCircleId?: string | null;
}) {
  const [type, setType] = useState(targetType === "circle" ? "circle" : targetType === "user" ? "user" : "none");
  return (
    <>
      <Field label="Ziel">
        <select className={selectClass} name="targetType" value={type} onChange={(event) => setType(event.currentTarget.value)}>
          <option value="none">Bitte auswählen</option>
          <option value="user">Ein Benutzer</option>
          <option value="circle">Ganzer Kreis</option>
        </select>
      </Field>
      {type === "user" ? (
        <Field label="Ziel-Benutzer">
          <select className={selectClass} name="targetUserId" defaultValue={targetUserId || ""} required>
            <option value="">Bitte auswählen</option>
            {users.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
          </select>
        </Field>
      ) : (
        <input type="hidden" name="targetUserId" value="" />
      )}
      {type === "circle" ? (
        <Field label="Ziel-Kreis">
          <select className={selectClass} name="targetCircleId" defaultValue={targetCircleId || ""} required>
            <option value="">Bitte auswählen</option>
            {circles.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
          </select>
        </Field>
      ) : (
        <input type="hidden" name="targetCircleId" value="" />
      )}
    </>
  );
}
