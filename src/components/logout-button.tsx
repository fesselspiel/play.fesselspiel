"use client";

import { useState } from "react";

export function LogoutButton({ className }: { className?: string }) {
  const [pending, setPending] = useState(false);
  return (
    <button
      type="button"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }).catch(() => null);
        window.location.assign("/login");
      }}
      className={className}
    >
      {pending ? "Wird abgemeldet..." : "Abmelden"}
    </button>
  );
}
