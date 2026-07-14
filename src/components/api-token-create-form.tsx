"use client";

import { FormEvent, useState } from "react";
import { Plus } from "lucide-react";
import { Button, Field, inputClass } from "@/components/ui";

type CreatedToken = { token: string; tokenLastSix: string };

export function ApiTokenCreateForm() {
  const [created, setCreated] = useState<CreatedToken | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    setCreated(null);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/settings/api-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: String(form.get("name") || "") })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || "Token konnte nicht erzeugt werden.");
      setCreated({ token: body.token, tokenLastSix: body.tokenLastSix });
      event.currentTarget.reset();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Token konnte nicht erzeugt werden.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      {created ? (
        <div className="mb-4 rounded-md border border-redbrand bg-redbrand/10 p-3 text-sm" role="status">
          <div className="font-semibold text-ink">Neuer Token, nur jetzt sichtbar</div>
          <code className="mt-2 block overflow-x-auto rounded-md bg-surface p-2 text-xs text-ink">{created.token}</code>
          <p className="mt-2 text-graphite">Endet auf …{created.tokenLastSix}</p>
        </div>
      ) : null}
      {error ? <p className="mb-4 text-sm font-semibold text-redbrand" role="alert">{error}</p> : null}
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name">
          <input className={inputClass} name="name" placeholder="iPhone Kurzbefehl" maxLength={80} required />
        </Field>
        <Button type="submit" disabled={pending}><Plus className="h-4 w-4" /> {pending ? "Token wird erzeugt…" : "Token erzeugen"}</Button>
      </form>
    </>
  );
}
