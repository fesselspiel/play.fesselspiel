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

async function createPosition(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  const name = String(formData.get("name") || "").trim();
  const slug = await uniqueSlug("position", normalizeSlug(String(formData.get("slug") || ""), name));
  const toolIds = formData.getAll("tools").map(String);
  const accessibleTools = toolIds.length ? await prisma.toy.findMany({ where: { ...(await ownerScope(user)), id: { in: toolIds } }, select: { id: true } }) : [];
  const uploadedImageUrl = String(formData.get("imageUploadedUrl") || "").trim();
  const image = uploadedImageUrl ? null : await saveUploadedFile(user.id, formData.get("image") as File | null);
  await prisma.position.create({
    data: {
      ownerId: user.id,
      name,
      slug,
      imageUrl: uploadedImageUrl || (image ? fileAssetUrl(image.id) : ""),
      description: String(formData.get("description") || "").trim(),
      tools: { connect: accessibleTools.map(({ id }) => ({ id })) }
    }
  });
  redirect(`/positions/${slug}`);
}

export default async function NewPositionPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const toys = await prisma.toy.findMany({ where: await ownerScope(user), orderBy: { title: "asc" } });
  return (
    <AppShell>
      <PageHeader title="Stellung anlegen" />
      <PageGuide title="Positionen mit Spielzeugen verknuepfen">
        Lege hier eine neue Stellung mit Name, Bild und Beschreibung an. Waehle vorhandene Spielzeuge aus, damit die Stellung spaeter in Aktivitaeten passend vorgeschlagen und verlinkt werden kann.
      </PageGuide>
      <form action={createPosition} className="max-w-3xl space-y-4">
        <Field label="Name"><input className={inputClass} name="name" required placeholder="Rueckenlage" /></Field>
        <Field label="URL-Slug"><input className={inputClass} name="slug" pattern="[a-z0-9-]*" placeholder="rueckenlage" /></Field>
        <FileUploadField name="image" uploadedUrlName="imageUploadedUrl" label="Bild" accept="image/*" help="Waehle ein Bild aus der Mediathek oder Kamera aus." />
        <Field label="Beschreibung"><textarea className={inputClass} name="description" rows={5} /></Field>
        <div>
          <div className="mb-2 text-sm font-medium text-graphite">Spielzeuge</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {toys.map((toy) => (
              <label key={toy.id} className="flex items-center gap-3 rounded-md bg-paper p-3 text-sm">
                <input name="tools" value={toy.id} type="checkbox" className="h-4 w-4 accent-redbrand" />
                <span>{toy.title}</span>
              </label>
            ))}
          </div>
        </div>
        <Button><Save className="h-4 w-4" /> Speichern</Button>
      </form>
    </AppShell>
  );
}
