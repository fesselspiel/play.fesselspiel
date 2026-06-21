import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Save, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { FileUploadField } from "@/components/file-upload-field";
import { Button, Field, inputClass, PageGuide, PageHeader } from "@/components/ui";
import { contentTenantScope, isAccessibleOwner, ownerScope } from "@/lib/access";
import { currentUser } from "@/lib/auth";
import { hasFeature, requireFeature } from "@/lib/features";
import { deleteOwnedFile, fileAssetUrl, fileIdFromUrl, saveUploadedFile } from "@/lib/files";
import { prisma } from "@/lib/prisma";
import { normalizeSlug, uniqueSlugForUpdate } from "@/lib/slug";

async function updateToy(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  await requireFeature("toys");
  const positionsEnabled = await hasFeature("positions");
  const id = String(formData.get("id"));
  const toy = await prisma.toy.findFirst({ where: { id, ...(await ownerScope(user)) } });
  if (!toy) notFound();

  const title = String(formData.get("title") || "").trim();
  const slug = await uniqueSlugForUpdate("toy", normalizeSlug(String(formData.get("slug") || ""), title), toy.id, user.tenantId);
  const uploadedImageUrl = String(formData.get("imageUploadedUrl") || "").trim();
  const image = uploadedImageUrl ? null : await saveUploadedFile(user.id, formData.get("image") as File | null);
  const removeImage = formData.get("removeImage") === "on";
  const oldFileId = fileIdFromUrl(toy.imageUrl);
  const imageUrl = uploadedImageUrl || (image ? fileAssetUrl(image.id) : removeImage ? "" : toy.imageUrl);
  const selectedPositionIds = positionsEnabled ? formData.getAll("positions").map(String) : [];
  const positions = positionsEnabled ? await prisma.position.findMany({ where: { ...(await ownerScope(user)), id: { in: selectedPositionIds } }, select: { id: true } }) : [];

  await prisma.toy.update({
    where: { id: toy.id },
    data: {
      title,
      slug,
      description: String(formData.get("description") || "").trim(),
      imageUrl,
      ...(positionsEnabled ? { positions: { set: positions.map((position) => ({ id: position.id })) } } : {})
    }
  });

  if ((uploadedImageUrl || image || removeImage) && oldFileId) await deleteOwnedFile(user.id, oldFileId);
  redirect(`/toys/${slug}`);
}

async function deleteToy(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  await requireFeature("toys");
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
  await requireFeature("toys");
  const positionsEnabled = await hasFeature("positions");
  const toy = await prisma.toy.findFirst({ where: { slug: params.slug, ...contentTenantScope(user) }, include: { positions: positionsEnabled } });
  if (!toy || !(await isAccessibleOwner(user, toy.ownerId))) notFound();
  const positions = positionsEnabled ? await prisma.position.findMany({ where: await ownerScope(user), orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }) : [];
  const selectedPositions = new Set(positionsEnabled ? toy.positions.map((position) => position.id) : []);

  return (
    <AppShell>
      <PageHeader title="Spielzeug bearbeiten" />
      <PageGuide>
        Ändere hier Titel, Slug, Bild, Beschreibung und verknüpfte Szenen. Ein neues Bild ersetzt das alte; wenn du das Bild entfernst oder den Eintrag löschst, wird die gespeicherte Datei ebenfalls vom Server entfernt.
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
            help="Ein neu ausgewähltes Bild ersetzt das aktuelle Bild automatisch."
          />
          <Field label="Beschreibung">
            <textarea className={inputClass} name="description" rows={6} defaultValue={toy.description || ""} />
          </Field>
          {positionsEnabled ? (
            <div>
              <div className="mb-2 text-sm font-medium text-graphite">Mit Szenen verknüpfen</div>
              {positions.length ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {positions.map((position) => (
                    <label key={position.id} className="flex items-center gap-3 rounded-md bg-paper p-3 text-sm">
                      <input name="positions" value={position.id} type="checkbox" defaultChecked={selectedPositions.has(position.id)} className="h-4 w-4 accent-redbrand" />
                      <span>{position.name}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <p className="rounded-md bg-paper p-3 text-sm text-graphite">Noch keine Szenen vorhanden.</p>
              )}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button>
              <Save className="h-4 w-4" />
              Änderungen speichern
            </Button>
            <Link href={`/toys/${toy.slug}`} className="focus-ring inline-flex min-h-10 items-center justify-center rounded-md border border-line bg-surface px-4 py-2 text-sm font-semibold hover:bg-paper">
              Abbrechen
            </Link>
          </div>
        </form>
        <form action={deleteToy} className="rounded-lg border border-line bg-paper p-5">
          <input type="hidden" name="id" value={toy.id} />
          <h2 className="text-lg font-semibold">Löschen</h2>
          <p className="mt-2 text-sm text-graphite">Entfernt den Eintrag, seine Verknüpfungen und das hinterlegte Bild vom Server.</p>
          <Button variant="danger" className="mt-4 w-full">
            <Trash2 className="h-4 w-4" />
            Spielzeug löschen
          </Button>
        </form>
      </div>
    </AppShell>
  );
}
