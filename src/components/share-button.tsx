"use client";

import { useMemo, useState } from "react";
import { Mail, MessageCircle, Send, Share2, Smartphone, X } from "lucide-react";
import type { ShareTargets } from "@/lib/share";

type ShareChannel = "email" | "telegram" | "push" | "all";
type TargetType = "user" | "circle";

const channelOptions: { value: ShareChannel; label: string; icon: typeof Mail }[] = [
  { value: "all", label: "Alles", icon: Send },
  { value: "telegram", label: "Telegram", icon: MessageCircle },
  { value: "push", label: "Push", icon: Smartphone },
  { value: "email", label: "E-Mail", icon: Mail }
];

export function ShareButton({
  entityType,
  entityId,
  title,
  href,
  text,
  targets,
  defaultChannel = "all",
  messageTemplate,
  label = "Teilen"
}: {
  entityType: string;
  entityId: string;
  title: string;
  href: string;
  text?: string | null;
  targets: ShareTargets;
  defaultChannel?: ShareChannel | string | null;
  messageTemplate?: string | null;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const normalizedDefaultChannel = channelOptions.some((option) => option.value === defaultChannel) ? defaultChannel as ShareChannel : "all";
  const defaultNote = (messageTemplate || text || "")
    .replace(/\{title\}/g, title)
    .replace(/\{url\}/g, href)
    .replace(/\{type\}/g, entityType);
  const [channel, setChannel] = useState<ShareChannel>(normalizedDefaultChannel);
  const [targetType, setTargetType] = useState<TargetType>(targets.circles.length ? "circle" : "user");
  const [targetId, setTargetId] = useState("");
  const [note, setNote] = useState(defaultNote);
  const [status, setStatus] = useState("");
  const [sending, setSending] = useState(false);
  const options = targetType === "circle" ? targets.circles : targets.users;
  const firstTarget = options[0]?.id || "";
  const selectedTargetId = targetId || firstTarget;
  const disabled = sending || !selectedTargetId || !options.length;
  const targetLabel = useMemo(() => {
    if (targets.circles.length && targets.users.length) return targetType === "circle" ? "Zirkel" : "Benutzer";
    return targets.circles.length ? "Zirkel" : "Benutzer";
  }, [targetType, targets.circles.length, targets.users.length]);

  async function submit() {
    if (disabled) return;
    setSending(true);
    setStatus("");
    const response = await fetch("/api/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channel,
        targetType,
        targetId: selectedTargetId,
        entityType,
        entityId,
        title,
        href,
        text: note
      })
    });
    const payload = await response.json().catch(() => null);
    setSending(false);
    if (!response.ok || !payload?.ok) {
      setStatus(payload?.error || "Teilen fehlgeschlagen.");
      return;
    }
    setStatus("Geteilt.");
    setTimeout(() => setOpen(false), 700);
  }

  return (
    <div className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="focus-ring inline-flex min-h-8 items-center gap-1 rounded-sm px-1.5 py-1 text-xs font-semibold text-graphite hover:text-redbrand"
      >
        <Share2 className="h-3.5 w-3.5" />
        {label}
      </button>
      {open ? (
        <>
        <button type="button" aria-label="Teilen schließen" onClick={() => setOpen(false)} className="fixed inset-0 z-[70] bg-black/20 sm:hidden" />
        <div className="fixed inset-x-3 bottom-3 z-[80] max-h-[calc(100dvh-1.5rem)] overflow-y-auto rounded-lg border border-line bg-surface p-3 text-left shadow-xl sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-full sm:z-40 sm:mt-2 sm:w-[min(92vw,360px)]">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-ink">Teilen als</div>
              <div className="mt-0.5 max-w-64 truncate text-xs text-graphite">{title}</div>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="rounded-md p-1 text-graphite hover:bg-paper" aria-label="Schließen">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {channelOptions.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setChannel(option.value)}
                  className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-md border px-2 text-xs font-semibold ${
                    channel === option.value ? "border-redbrand bg-redbrand text-white" : "border-line bg-paper text-graphite hover:text-redbrand"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {option.label}
                </button>
              );
            })}
          </div>
          {targets.circles.length && targets.users.length ? (
            <div className="mt-3 grid grid-cols-2 rounded-md border border-line bg-paper p-1">
              <button type="button" onClick={() => { setTargetType("circle"); setTargetId(""); }} className={`rounded px-3 py-2 text-xs font-semibold ${targetType === "circle" ? "bg-surface text-redbrand shadow-sm" : "text-graphite"}`}>Zirkel</button>
              <button type="button" onClick={() => { setTargetType("user"); setTargetId(""); }} className={`rounded px-3 py-2 text-xs font-semibold ${targetType === "user" ? "bg-surface text-redbrand shadow-sm" : "text-graphite"}`}>Benutzer</button>
            </div>
          ) : null}
          <label className="mt-3 block text-xs font-semibold text-graphite">
            {targetLabel}
            <select value={selectedTargetId} onChange={(event) => setTargetId(event.currentTarget.value)} className="mt-1 w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink">
              {options.length ? options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>) : <option value="">Kein Ziel verfügbar</option>}
            </select>
          </label>
          <label className="mt-3 block text-xs font-semibold text-graphite">
            Nachricht
            <textarea value={note} onChange={(event) => setNote(event.currentTarget.value)} rows={3} className="mt-1 w-full resize-none rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink" />
          </label>
          {status ? <p className={`mt-2 text-xs font-semibold ${status === "Geteilt." ? "text-emerald-600" : "text-redbrand"}`}>{status}</p> : null}
          <button
            type="button"
            disabled={disabled}
            onClick={submit}
            className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-redbrand px-4 py-2 text-sm font-semibold text-white hover:bg-redbrandHover disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Share2 className="h-4 w-4" />
            {sending ? "Wird geteilt..." : "Teilen"}
          </button>
        </div>
        </>
      ) : null}
    </div>
  );
}
