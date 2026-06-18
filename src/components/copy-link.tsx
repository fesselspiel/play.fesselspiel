"use client";

import { Link2 } from "lucide-react";
import { useState } from "react";

export function CopyLink({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="focus-ring inline-flex min-h-9 max-w-full items-center gap-2 rounded-md border border-line bg-surface px-3 py-1.5 text-left text-sm font-medium text-graphite hover:bg-paper hover:text-redbrand"
      title="Link kopieren"
    >
      <Link2 className="h-4 w-4 shrink-0 text-redbrand" />
      <span className="truncate">{label}</span>
      <span className="shrink-0 text-xs text-graphite">{copied ? "kopiert" : "kopieren"}</span>
    </button>
  );
}
