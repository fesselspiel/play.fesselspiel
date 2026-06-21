"use client";

import { useRef } from "react";
import { Field, inputClass } from "@/components/ui";

type TemplateVariable = {
  token: string;
  label: string;
};

export function TemplateVariableTextarea({
  label,
  name,
  defaultValue,
  rows = 5,
  variables,
  required = false,
  helpText = "Klick fügt die Variable an der Cursorposition ein.",
  textareaClassName = ""
}: {
  label: string;
  name: string;
  defaultValue: string;
  rows?: number;
  variables: TemplateVariable[];
  required?: boolean;
  helpText?: string;
  textareaClassName?: string;
}) {
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
    <Field label={label}>
      <textarea ref={textareaRef} className={`${inputClass} ${textareaClassName}`} name={name} rows={rows} defaultValue={defaultValue} required={required} />
      <div className="mt-2 flex flex-wrap gap-2">
        {variables.map((entry) => (
          <button
            key={entry.token}
            type="button"
            className="focus-ring inline-flex min-h-8 items-center rounded-md border border-line bg-paper px-3 py-1 text-xs font-semibold text-ink transition hover:border-redbrand/50 hover:bg-surface hover:text-redbrand"
            onClick={() => insertVariable(entry.token)}
          >
            {entry.label}
          </button>
        ))}
      </div>
      {helpText ? <p className="mt-2 text-xs text-graphite">{helpText}</p> : null}
    </Field>
  );
}
