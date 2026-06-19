"use client";

import { useState } from "react";
import { inputClass } from "@/components/ui";

export function UsernameField({ defaultValue = "" }: { defaultValue?: string }) {
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
          const response = await fetch(`/api/users/check-username?username=${encodeURIComponent(username)}`);
          const payload = (await response.json().catch(() => ({}))) as { available?: boolean };
          setMessage(payload.available ? "Benutzername ist frei." : "Benutzername ist bereits vergeben.");
        }}
      />
      {message ? <p className={`mt-1 text-xs ${message.includes("frei") ? "text-emerald-700" : "text-redbrand"}`}>{message}</p> : null}
    </div>
  );
}
