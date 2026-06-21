"use client";

import { TemplateVariableTextarea } from "@/components/template-variable-textarea";

const variables = [
  { token: "{title}", label: "Titel" },
  { token: "{actor}", label: "Benutzer" },
  { token: "{event}", label: "Aktueller Event" },
  { token: "{action}", label: "Aktion" },
  { token: "{url}", label: "Link" },
  { token: "{details}", label: "Details" }
];

export function NotificationMessageField({ defaultValue }: { defaultValue: string }) {
  return (
    <TemplateVariableTextarea
      label="Telegram-Nachricht als HTML"
      name="message"
      rows={5}
      defaultValue={defaultValue}
      variables={variables}
      required
    />
  );
}
