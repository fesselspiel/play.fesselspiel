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
  targetType = "user",
  targetUserId = "",
  targetCircleId = ""
}: {
  users: TargetUser[];
  circles: TargetCircle[];
  targetType?: string;
  targetUserId?: string | null;
  targetCircleId?: string | null;
}) {
  const [type, setType] = useState(targetType === "circle" ? "circle" : "user");
  return (
    <>
      <Field label="Ziel">
        <select className={selectClass} name="targetType" value={type} onChange={(event) => setType(event.currentTarget.value)}>
          <option value="user">Ein Benutzer</option>
          <option value="circle">Ganzer Kreis</option>
        </select>
      </Field>
      {type === "user" ? (
        <Field label="Ziel-Benutzer">
          <select className={selectClass} name="targetUserId" defaultValue={targetUserId || users[0]?.id || ""} required>
            {users.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
          </select>
        </Field>
      ) : (
        <input type="hidden" name="targetUserId" value="" />
      )}
      {type === "circle" ? (
        <Field label="Ziel-Kreis">
          <select className={selectClass} name="targetCircleId" defaultValue={targetCircleId || circles[0]?.id || ""} required>
            {circles.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
          </select>
        </Field>
      ) : (
        <input type="hidden" name="targetCircleId" value="" />
      )}
    </>
  );
}
