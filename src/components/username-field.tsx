"use client";

import { useState } from "react";
import { inputClass } from "@/components/ui";

export function UsernameField({ defaultValue = "", excludeId }: { defaultValue?: string; excludeId?: string }) {
  const [message, setMessage] = useState("");
  return (
    <div>
      <input
        className={inputClass}
        name="username"
        defaultValue={defaultValue}
        onBlur={async (event) => {
          const username = event.currentTarget.value.trim();
          setMessage("");
          if (!username) return;
          const params = new URLSearchParams({ username });
          if (excludeId) params.set("excludeId", excludeId);
          const response = await fetch(`/api/users/check-username?${params.toString()}`);
          const payload = (await response.json().catch(() => ({}))) as { available?: boolean; valid?: boolean; username?: string | null };
          if (payload.username && payload.username !== username) event.currentTarget.value = payload.username;
          setMessage(!payload.valid ? "Nur Kleinbuchstaben, Zahlen, Bindestrich und Unterstrich, 2-40 Zeichen." : payload.available ? "Benutzername ist frei." : "Benutzername ist bereits vergeben.");
        }}
      />
      {message ? <p className={`mt-1 text-xs ${message.includes("frei") ? "text-emerald-700" : "text-redbrand"}`}>{message}</p> : null}
    </div>
  );
}
