"use client";

import { useRef } from "react";
import { Field, inputClass } from "@/components/ui";

const variables = [
  { token: "{title}", label: "Titel" },
  { token: "{actor}", label: "Benutzer" },
  { token: "{event}", label: "Aktueller Event" },
  { token: "{action}", label: "Aktion" },
  { token: "{url}", label: "Link" },
  { token: "{details}", label: "Details" }
];

export function NotificationMessageField({ defaultValue }: { defaultValue: string }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function insertVariable(token: string) {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? textarea.value.length;
    const before = textarea.value.slice(0, start);
    const after = textarea.value.slice(end);
    textarea.value = `${before}${token}${after}`;
    const nextPosition = start + token.length;
    textarea.focus();
    textarea.setSelectionRange(nextPosition, nextPosition);
  }

  return (
    <Field label="Telegram-Nachricht als HTML">
      <textarea ref={textareaRef} className={inputClass} name="message" rows={5} defaultValue={defaultValue} required />
      <div className="mt-2 flex flex-wrap gap-2">
        {variables.map((entry) => (
          <button
            key={entry.token}
            type="button"
            className="focus-ring inline-flex min-h-8 items-center rounded-full border border-line bg-surface px-3 py-1 text-xs font-semibold text-ink hover:border-redbrand/50 hover:bg-paper"
            onClick={() => insertVariable(entry.token)}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-graphite">Klick fügt die Variable an der Cursorposition ein.</p>
    </Field>
  );
}
