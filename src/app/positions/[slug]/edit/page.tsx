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

async function updatePosition(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id"));
  const scope = await ownerScope(user);
  const position = await prisma.position.findFirst({ where: { id, ...scope } });
  if (!position) notFound();

  const name = String(formData.get("name") || "").trim();
  const slug = await uniqueSlugForUpdate("position", normalizeSlug(String(formData.get("slug") || ""), name), position.id);
  const selectedToolIds = formData.getAll("tools").map(String);
  const ownedTools = await prisma.toy.findMany({ where: { ...scope, id: { in: selectedToolIds } }, select: { id: true } });
  const uploadedImageUrl = String(formData.get("imageUploadedUrl") || "").trim();
  const image = uploadedImageUrl ? null : await saveUploadedFile(user.id, formData.get("image") as File | null);
  const removeImage = formData.get("removeImage") === "on";
  const oldFileId = fileIdFromUrl(position.imageUrl);
  const imageUrl = uploadedImageUrl || (image ? fileAssetUrl(image.id) : removeImage ? "" : position.imageUrl);

  await prisma.position.update({
    where: { id: position.id },
    data: {
      name,
      slug,
      imageUrl,
      description: String(formData.get("description") || "").trim(),
      selfBondageCapable: formData.get("selfBondageCapable") === "on",
      tools: { set: ownedTools.map((tool) => ({ id: tool.id })) }
    }
  });

  if ((uploadedImageUrl || image || removeImage) && oldFileId) await deleteOwnedFile(user.id, oldFileId);
  redirect(`/positions/${slug}`);
}

async function deletePosition(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id"));
  const position = await prisma.position.findFirst({ where: { id, ...(await ownerScope(user)) } });
  if (!position) notFound();
  const fileId = fileIdFromUrl(position.imageUrl);
  await prisma.position.delete({ where: { id: position.id } });
  if (fileId) await deleteOwnedFile(user.id, fileId);
  redirect("/positions");
}

export default async function EditPositionPage({ params }: { params: { slug: string } }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const position = await prisma.position.findUnique({ where: { slug: params.slug }, include: { tools: true } });
  if (!position || !(await isAccessibleOwner(user, position.ownerId))) notFound();
  const toys = await prisma.toy.findMany({ where: await ownerScope(user), orderBy: [{ sortOrder: "asc" }, { title: "asc" }] });
  const selected = new Set(position.tools.map((tool) => tool.id));

  return (
    <AppShell>
      <PageHeader title="Stellung bearbeiten" />
      <PageGuide>
        Bearbeite hier Name, Slug, Bild, Beschreibung und die verknüpften Spielzeuge. Beim Ersetzen oder Entfernen eines Bildes wird die alte Datei bereinigt.
      </PageGuide>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <form action={updatePosition} className="max-w-3xl space-y-4">
          <input type="hidden" name="id" value={position.id} />
          <Field label="Name"><input className={inputClass} name="name" required defaultValue={position.name} /></Field>
          <Field label="URL-Slug"><input className={inputClass} name="slug" pattern="[a-z0-9-]*" defaultValue={position.slug} /></Field>
          <FileUploadField
            name="image"
            uploadedUrlName="imageUploadedUrl"
            label="Bild"
            accept="image/*"
            currentUrl={position.imageUrl || null}
            currentAlt={position.name}
            removeName="removeImage"
            help="Ein neu ausgewähltes Bild ersetzt das aktuelle Bild automatisch."
          />
          <Field label="Beschreibung"><textarea className={inputClass} name="description" rows={5} defaultValue={position.description || ""} /></Field>
          <label className="flex items-center gap-3 rounded-md bg-paper p-3 text-sm font-medium text-ink">
            <input name="selfBondageCapable" type="checkbox" defaultChecked={position.selfBondageCapable} className="h-4 w-4 accent-redbrand" />
            <span>Self-Bondage-fähig</span>
          </label>
          <div>
            <div className="mb-2 text-sm font-medium text-graphite">Spielzeuge</div>
            <div className="grid gap-2 sm:grid-cols-2">
              {toys.map((toy) => (
                <label key={toy.id} className="flex items-center gap-3 rounded-md bg-paper p-3 text-sm">
                  <input name="tools" value={toy.id} type="checkbox" defaultChecked={selected.has(toy.id)} className="h-4 w-4 accent-redbrand" />
                  <span>{toy.title}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button><Save className="h-4 w-4" /> Änderungen speichern</Button>
            <Link href={`/positions/${position.slug}`} className="focus-ring inline-flex min-h-10 items-center justify-center rounded-md border border-line bg-surface px-4 py-2 text-sm font-semibold hover:bg-paper">
              Abbrechen
            </Link>
          </div>
        </form>
        <form action={deletePosition} className="rounded-lg border border-line bg-paper p-5">
          <input type="hidden" name="id" value={position.id} />
          <h2 className="text-lg font-semibold">Löschen</h2>
          <p className="mt-2 text-sm text-graphite">Entfernt die Stellung, ihre Verknüpfungen und das hinterlegte Bild vom Server.</p>
          <Button variant="danger" className="mt-4 w-full"><Trash2 className="h-4 w-4" /> Stellung löschen</Button>
        </form>
      </div>
    </AppShell>
  );
}
