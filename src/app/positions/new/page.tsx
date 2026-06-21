import { redirect } from "next/navigation";
import { Save } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { FileUploadField } from "@/components/file-upload-field";
import { Button, Field, inputClass, PageGuide, PageHeader } from "@/components/ui";
import { bondageSystemVisibilityScope, ownerScope } from "@/lib/access";
import { currentUser } from "@/lib/auth";
import { hasFeature, requireFeature } from "@/lib/features";
import { fileAssetUrl, saveUploadedFile } from "@/lib/files";
import { prisma } from "@/lib/prisma";
import { normalizeSlug, uniqueSlug } from "@/lib/slug";

async function createPosition(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  await requireFeature("positions");
  const toysEnabled = await hasFeature("toys");
  const bondageSystemEnabled = await hasFeature("shopifyBondageSystem");
  const name = String(formData.get("name") || "").trim();
  const slug = await uniqueSlug("position", normalizeSlug(String(formData.get("slug") || ""), name), user.tenantId);
  const toolIds = toysEnabled ? formData.getAll("tools").map(String) : [];
  const bondageItemIds = bondageSystemEnabled ? formData.getAll("bondageSystemItems").map(String) : [];
  const accessibleTools = toysEnabled && toolIds.length ? await prisma.toy.findMany({ where: { ...(await ownerScope(user)), id: { in: toolIds } }, select: { id: true } }) : [];
  const accessibleBondageItems = bondageSystemEnabled && bondageItemIds.length ? await prisma.bondageSystemItem.findMany({ where: { id: { in: bondageItemIds }, tenantId: user.tenantId || undefined, visible: true, ...bondageSystemVisibilityScope(user) }, select: { id: true } }) : [];
  const uploadedImageUrl = String(formData.get("imageUploadedUrl") || "").trim();
  const image = uploadedImageUrl ? null : await saveUploadedFile(user.id, formData.get("image") as File | null);
  await prisma.position.create({
    data: {
      tenantId: user.tenantId || undefined,
      ownerId: user.id,
      name,
      slug,
      imageUrl: uploadedImageUrl || (image ? fileAssetUrl(image.id) : ""),
      description: String(formData.get("description") || "").trim(),
      selfBondageCapable: formData.get("selfBondageCapable") === "on",
      ...(toysEnabled ? { tools: { connect: accessibleTools.map(({ id }) => ({ id })) } } : {}),
      ...(bondageSystemEnabled ? { bondageSystemItems: { connect: accessibleBondageItems.map(({ id }) => ({ id })) } } : {})
    }
  });
  redirect(`/positions/${slug}`);
}

export default async function NewPositionPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  await requireFeature("positions");
  const toysEnabled = await hasFeature("toys");
  const bondageSystemEnabled = await hasFeature("shopifyBondageSystem");
  const toys = toysEnabled ? await prisma.toy.findMany({ where: await ownerScope(user), orderBy: [{ sortOrder: "asc" }, { title: "asc" }] }) : [];
  const bondageItems = bondageSystemEnabled ? await prisma.bondageSystemItem.findMany({
    where: { tenantId: user.tenantId || undefined, visible: true, ...bondageSystemVisibilityScope(user) },
    include: { product: true },
    orderBy: [{ sortOrder: "asc" }, { product: { title: "asc" } }]
  }) : [];
  return (
    <AppShell>
      <PageHeader title="Szene anlegen" />
      <PageGuide title="Positionen mit Spielzeugen verknüpfen">
        Lege hier eine neue Szene mit Name, Bild und Beschreibung an. Wähle vorhandene Spielzeuge aus, damit die Szene später in Aktivitäten passend vorgeschlagen und verlinkt werden kann.
      </PageGuide>
      <form action={createPosition} className="max-w-3xl space-y-4">
        <Field label="Name"><input className={inputClass} name="name" required placeholder="Rückenlage" /></Field>
        <Field label="URL-Slug"><input className={inputClass} name="slug" pattern="[a-z0-9-]*" placeholder="rueckenlage" /></Field>
        <FileUploadField name="image" uploadedUrlName="imageUploadedUrl" label="Bild" accept="image/*" help="Wähle ein Bild aus der Mediathek oder Kamera aus." />
        <Field label="Beschreibung"><textarea className={inputClass} name="description" rows={5} /></Field>
        <label className="flex items-center gap-3 rounded-md bg-paper p-3 text-sm font-medium text-ink">
          <input name="selfBondageCapable" type="checkbox" className="h-4 w-4 accent-redbrand" />
          <span>Self-Bondage-fähig</span>
        </label>
        {toysEnabled ? (
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
        ) : null}
        {bondageSystemEnabled ? (
          <div>
            <div className="mb-2 text-sm font-medium text-graphite">Bondage-System</div>
            <div className="grid gap-2 sm:grid-cols-2">
              {bondageItems.map((item) => (
                <label key={item.id} className="flex items-center gap-3 rounded-md bg-paper p-3 text-sm">
                  <input name="bondageSystemItems" value={item.id} type="checkbox" className="h-4 w-4 accent-redbrand" />
                  <span>{item.product.title}</span>
                </label>
              ))}
            </div>
          </div>
        ) : null}
        <Button><Save className="h-4 w-4" /> Speichern</Button>
      </form>
    </AppShell>
  );
}
