"use client";

export function CopySubtitle({ value, label }: { value: string; label: string }) {
  async function copy() {
    await navigator.clipboard.writeText(value);
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="focus-ring max-w-full rounded-sm text-left hover:text-redbrand"
      title="URL kopieren"
      aria-label="Komplette URL kopieren"
    >
      {label}
    </button>
  );
}
