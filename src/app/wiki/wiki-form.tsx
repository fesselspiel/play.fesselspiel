import type { Circle, User, WikiPage, WikiPageShare } from "@prisma/client";
import { Save } from "lucide-react";
import { Button, Field, inputClass, selectClass } from "@/components/ui";

type UserWithProfile = User & { profile?: { displayName?: string | null } | null };
type PageWithShares = WikiPage & { shares: WikiPageShare[] };

function displayName(user: UserWithProfile) {
  return user.profile?.displayName || user.name || user.username || user.email;
}

export function WikiForm({
  action,
  page,
  users,
  circles
}: {
  action: (formData: FormData) => Promise<void>;
  page?: PageWithShares;
  users: UserWithProfile[];
  circles: Circle[];
}) {
  const sharedUserIds = new Set(page?.shares.map((share) => share.targetUserId).filter(Boolean));
  const sharedCircleIds = new Set(page?.shares.map((share) => share.targetCircleId).filter(Boolean));
  return (
    <form action={action} className="max-w-4xl space-y-4">
      {page ? <input type="hidden" name="id" value={page.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Titel">
          <input className={inputClass} name="title" required defaultValue={page?.title || ""} placeholder="Hausregeln, Ideen, Ablauf ..." />
        </Field>
        <Field label="URL-Slug">
          <input className={inputClass} name="slug" pattern="[a-z0-9-]*" defaultValue={page?.slug || ""} placeholder="hausregeln" />
        </Field>
      </div>
      <Field label="Kurzbeschreibung">
        <input className={inputClass} name="summary" defaultValue={page?.summary || ""} placeholder="Worum geht es auf dieser Seite?" />
      </Field>
      <Field label="Sichtbarkeit">
        <select className={selectClass} name="visibility" defaultValue={page?.visibility || "PRIVATE"}>
          <option value="PRIVATE">Nur für mich</option>
          <option value="PARTNER">Mein Zirkel</option>
          <option value="SHARED">Alle sichtbaren Benutzer dieser Seite</option>
        </select>
      </Field>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-line bg-paper p-4">
          <h2 className="text-sm font-semibold text-ink">Zusätzlich für Benutzer freigeben</h2>
          <div className="mt-3 max-h-52 space-y-2 overflow-y-auto pr-1">
            {users.map((entry) => (
              <label key={entry.id} className="flex items-center gap-3 rounded-md bg-surface p-3 text-sm text-graphite">
                <input name="shareUsers" value={entry.id} type="checkbox" defaultChecked={sharedUserIds.has(entry.id)} className="h-4 w-4 accent-redbrand" />
                <span>{displayName(entry)}</span>
              </label>
            ))}
            {!users.length ? <p className="text-sm text-graphite">Keine weiteren Benutzer verfügbar.</p> : null}
          </div>
        </div>
        <div className="rounded-lg border border-line bg-paper p-4">
          <h2 className="text-sm font-semibold text-ink">Zusätzlich für Zirkel freigeben</h2>
          <div className="mt-3 max-h-52 space-y-2 overflow-y-auto pr-1">
            {circles.map((circle) => (
              <label key={circle.id} className="flex items-center gap-3 rounded-md bg-surface p-3 text-sm text-graphite">
                <input name="shareCircles" value={circle.id} type="checkbox" defaultChecked={sharedCircleIds.has(circle.id)} className="h-4 w-4 accent-redbrand" />
                <span>{circle.name}</span>
              </label>
            ))}
            {!circles.length ? <p className="text-sm text-graphite">Keine Zirkel verfügbar.</p> : null}
          </div>
        </div>
      </div>
      <Field label="MediaWiki-Text">
        <textarea className={`${inputClass} font-mono leading-6`} name="content" rows={16} defaultValue={page?.content || ""} placeholder={"== Überschrift ==\n\n'''Wichtig''' und ''kursiv''.\n\n* Punkt eins\n* Punkt zwei\n\n[[Andere Seite]]"} />
      </Field>
      <Button>
        <Save className="h-4 w-4" />
        Speichern
      </Button>
    </form>
  );
}
