"use client";

import { Plus } from "lucide-react";
import { SubmitButton } from "@/components/submit-button";
import { Field, inputClass, selectClass } from "@/components/ui";

export function QuickAlbumForm({
  action,
  mediaId
}: {
  action: (formData: FormData) => void | Promise<void>;
  mediaId: string;
}) {
  return (
    <form action={action} className="space-y-3 border-t border-line p-4">
      <input type="hidden" name="mediaId" value={mediaId} />
      <Field label="Neues Album fuer dieses Bild">
        <input className={inputClass} name="title" placeholder="Albumname" required />
      </Field>
      <Field label="Sichtbarkeit">
        <select className={selectClass} name="visibility" defaultValue="PRIVATE">
          <option value="PRIVATE">Nur ich</option>
          <option value="PARTNER">Zirkel</option>
          <option value="SHARED">Alle</option>
        </select>
      </Field>
      <SubmitButton pendingLabel="Album wird angelegt..." className="w-full">
        <Plus className="h-4 w-4" />
        Album anlegen und Bild verschieben
      </SubmitButton>
    </form>
  );
}
