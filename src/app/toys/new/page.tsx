import { redirect } from "next/navigation";
import { Save } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { FileUploadField } from "@/components/file-upload-field";
import { Button, Field, inputClass, PageGuide, PageHeader } from "@/components/ui";
import { ownerScope } from "@/lib/access";
import { currentUser } from "@/lib/auth";
import { fileAssetUrl, saveUploadedFile } from "@/lib/files";
import { prisma } from "@/lib/prisma";
import { normalizeSlug, uniqueSlug } from "@/lib/slug";

async function createToy(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  const title = String(formData.get("title") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const uploadedImageUrl = String(formData.get("imageUploadedUrl") || "").trim();
  const image = uploadedImageUrl ? null : await saveUploadedFile(user.id, formData.get("image") as File | null);
  const imageUrl = uploadedImageUrl || (image ? fileAssetUrl(image.id) : "");
  const requestedSlug = normalizeSlug(String(formData.get("slug") || ""), title);
  const slug = await uniqueSlug("toy", requestedSlug);
  const selectedPositionIds = formData.getAll("positions").map(String);
  const positions = await prisma.position.findMany({ where: { ...(await ownerScope(user)), id: { in: selectedPositionIds } }, select: { id: true } });
  await prisma.toy.create({
    data: {
      ownerId: user.id,
      title,
      description,
      imageUrl,
      slug,
      positions: { connect: positions.map((position) => ({ id: position.id })) }
    }
  });
  redirect(`/toys/${slug}`);
}

export default async function NewToyPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const positions = await prisma.position.findMany({ where: await ownerScope(user), orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  return (
    <AppShell>
      <PageHeader title="Spielzeug anlegen" />
      <PageGuide title="Spielzeug mit Bild, Slug und QR-Code anlegen">
        Erfasse hier ein neues Spielzeug mit Titel, optionalem Slug, Bild, Beschreibung und passenden Stellungen. Nach dem Speichern bekommt der Eintrag eine Detailseite mit geschuetztem Bild und QR-Code.
      </PageGuide>
      <form action={createToy} className="max-w-2xl space-y-4">
        <Field label="Titel">
          <input className={inputClass} name="title" required placeholder="Leder Manschetten" />
        </Field>
        <Field label="URL-Slug">
          <input className={inputClass} name="slug" pattern="[a-z0-9-]*" placeholder="leder-manschetten" />
        </Field>
        <FileUploadField name="image" uploadedUrlName="imageUploadedUrl" label="Foto/Bild" accept="image/*" help="Wähle ein Bild aus der Mediathek oder Kamera aus." />
        <Field label="Beschreibung">
          <textarea className={inputClass} name="description" rows={6} />
        </Field>
        <div>
          <div className="mb-2 text-sm font-medium text-graphite">Mit Stellungen verknüpfen</div>
          {positions.length ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {positions.map((position) => (
                <label key={position.id} className="flex items-center gap-3 rounded-md bg-paper p-3 text-sm">
                  <input name="positions" value={position.id} type="checkbox" className="h-4 w-4 accent-redbrand" />
                  <span>{position.name}</span>
                </label>
              ))}
            </div>
          ) : (
            <p className="rounded-md bg-paper p-3 text-sm text-graphite">Noch keine Stellungen vorhanden.</p>
          )}
        </div>
        <Button>
          <Save className="h-4 w-4" />
          Speichern
        </Button>
      </form>
    </AppShell>
  );
}
