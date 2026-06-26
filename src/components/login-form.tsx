"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { Eye, EyeOff, LockKeyhole, LogIn } from "lucide-react";
import { Button, Field, inputClass } from "@/components/ui";

export function LoginForm({ returnTo = "/" }: { returnTo?: string }) {
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError("");
    const response = await fetch("/api/auth/login", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identifier: String(formData.get("identifier") || "").trim(),
        password: formData.get("password"),
        remember: formData.get("remember") === "on"
      })
    });
    if (!response.ok) {
      setError("Benutzername oder Passwort stimmt nicht.");
      return;
    }
    window.location.assign(returnTo.startsWith("/") ? returnTo : "/");
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Benutzername oder E-Mail">
        <input className={inputClass} name="identifier" autoComplete="username" required />
      </Field>
      <Field label="Passwort">
        <div className="relative">
          <input
            className={`${inputClass} pr-12`}
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
          />
          <button
            type="button"
            className="focus-ring absolute inset-y-1 right-1 inline-flex w-10 items-center justify-center rounded-md text-graphite hover:bg-paper hover:text-ink"
            onClick={() => setShowPassword((value) => !value)}
            aria-label={showPassword ? "Passwort verbergen" : "Passwort anzeigen"}
            title={showPassword ? "Passwort verbergen" : "Passwort anzeigen"}
          >
            {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
        </div>
      </Field>
      <label className="flex items-center gap-2 text-sm text-graphite">
        <input name="remember" type="checkbox" className="h-4 w-4 accent-redbrand" />
        Angemeldet bleiben
      </label>
      {error ? <p className="text-sm font-medium text-redbrand">{error}</p> : null}
      <Button className="w-full">
        <LogIn className="h-4 w-4" />
        Einloggen
      </Button>
      <div className="flex items-center gap-2 text-xs text-graphite">
        <LockKeyhole className="h-4 w-4" />
        Passwortgeschützter privater Bereich.
      </div>
    </form>
  );
}
