import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Save, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { FileUploadField } from "@/components/file-upload-field";
import { Button, Field, inputClass, PageGuide, PageHeader } from "@/components/ui";
import { isAccessibleOwner, ownerScope } from "@/lib/access";
import { currentUser } from "@/lib/auth";
import { deleteOwnedFile, fileAssetUrl, fileIdFromUrl, saveUploadedFile } from "@/lib/files";
import { prisma } from "@/lib/prisma";
import { normalizeSlug, uniqueSlugForUpdate } from "@/lib/slug";

async function updateToy(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id"));
  const toy = await prisma.toy.findFirst({ where: { id, ...(await ownerScope(user)) } });
  if (!toy) notFound();

  const title = String(formData.get("title") || "").trim();
  const slug = await uniqueSlugForUpdate("toy", normalizeSlug(String(formData.get("slug") || ""), title), toy.id);
  const uploadedImageUrl = String(formData.get("imageUploadedUrl") || "").trim();
  const image = uploadedImageUrl ? null : await saveUploadedFile(user.id, formData.get("image") as File | null);
  const removeImage = formData.get("removeImage") === "on";
  const oldFileId = fileIdFromUrl(toy.imageUrl);
  const imageUrl = uploadedImageUrl || (image ? fileAssetUrl(image.id) : removeImage ? "" : toy.imageUrl);

  await prisma.toy.update({
    where: { id: toy.id },
    data: {
      title,
      slug,
      description: String(formData.get("description") || "").trim(),
      imageUrl
    }
  });

  if ((image || removeImage) && oldFileId) await deleteOwnedFile(user.id, oldFileId);
  redirect(`/toys/${slug}`);
}

async function deleteToy(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id"));
  const toy = await prisma.toy.findFirst({ where: { id, ...(await ownerScope(user)) } });
  if (!toy) notFound();
  const fileId = fileIdFromUrl(toy.imageUrl);
  await prisma.toy.delete({ where: { id: toy.id } });
  if (fileId) await deleteOwnedFile(user.id, fileId);
  redirect("/toys");
}

export default async function EditToyPage({ params }: { params: { slug: string } }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const toy = await prisma.toy.findUnique({ where: { slug: params.slug } });
  if (!toy || !(await isAccessibleOwner(user, toy.ownerId))) notFound();

  return (
    <AppShell>
      <PageHeader title="Spielzeug bearbeiten" />
      <PageGuide>
        Aendere hier Titel, Slug, Bild und Beschreibung. Ein neues Bild ersetzt das alte; wenn du das Bild entfernst oder den Eintrag loeschst, wird die gespeicherte Datei ebenfalls vom Server entfernt.
      </PageGuide>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <form action={updateToy} className="max-w-2xl space-y-4">
          <input type="hidden" name="id" value={toy.id} />
          <Field label="Titel">
            <input className={inputClass} name="title" required defaultValue={toy.title} />
          </Field>
          <Field label="URL-Slug">
            <input className={inputClass} name="slug" pattern="[a-z0-9-]*" defaultValue={toy.slug} />
          </Field>
          <FileUploadField
            name="image"
            uploadedUrlName="imageUploadedUrl"
            label="Foto/Bild"
            accept="image/*"
            currentUrl={toy.imageUrl || null}
            currentAlt={toy.title}
            removeName="removeImage"
            help="Ein neu ausgewaehltes Bild ersetzt das aktuelle Bild automatisch."
          />
          <Field label="Beschreibung">
            <textarea className={inputClass} name="description" rows={6} defaultValue={toy.description || ""} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button>
              <Save className="h-4 w-4" />
              Aenderungen speichern
            </Button>
            <Link href={`/toys/${toy.slug}`} className="focus-ring inline-flex min-h-10 items-center justify-center rounded-md border border-line bg-surface px-4 py-2 text-sm font-semibold hover:bg-paper">
              Abbrechen
            </Link>
          </div>
        </form>
        <form action={deleteToy} className="rounded-lg border border-line bg-paper p-5">
          <input type="hidden" name="id" value={toy.id} />
          <h2 className="text-lg font-semibold">Loeschen</h2>
          <p className="mt-2 text-sm text-graphite">Entfernt den Eintrag, seine Verknuepfungen und das hinterlegte Bild vom Server.</p>
          <Button variant="danger" className="mt-4 w-full">
            <Trash2 className="h-4 w-4" />
            Spielzeug loeschen
          </Button>
        </form>
      </div>
    </AppShell>
  );
}
