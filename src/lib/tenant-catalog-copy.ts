import { readFile } from "fs/promises";
import { logAction, userDisplayName } from "@/lib/audit";
import { getOrCreateCatalogCategory } from "@/lib/catalog-categories";
import { absolutePathForAsset, fileAssetUrl, fileIdFromUrl, saveFileBuffer } from "@/lib/files";
import { prisma } from "@/lib/prisma";
import { normalizeSlug, uniqueSlug, uniqueSlugForUpdate } from "@/lib/slug";

export type TenantCatalogCopyMode = "missing" | "refresh" | "duplicate";

type CopyCatalogOptions = {
  actorId: string;
  sourceTenantId: string;
  targetTenantId: string;
  toyIds: string[];
  positionIds: string[];
  mode: TenantCatalogCopyMode;
};

type CopyCatalogResult = {
  copiedToys: number;
  updatedToys: number;
  skippedToys: number;
  copiedPositions: number;
  updatedPositions: number;
  skippedPositions: number;
};

async function copyImageUrl(imageUrl: string | null | undefined, ownerId: string, targetTenantId: string) {
  if (!imageUrl) return null;
  const fileId = fileIdFromUrl(imageUrl);
  if (!fileId) return imageUrl;

  const asset = await prisma.fileAsset.findUnique({ where: { id: fileId } });
  if (!asset) return null;

  const bytes = await readFile(absolutePathForAsset(asset.storagePath)).catch(() => null);
  if (!bytes) return null;

  const copied = await saveFileBuffer({
    ownerId,
    tenantId: targetTenantId,
    bytes,
    originalName: asset.originalName,
    mimeType: asset.mimeType
  });
  return copied ? fileAssetUrl(copied.id) : null;
}

async function mappedToyForTarget(sourceToyId: string, targetTenantId: string) {
  return prisma.toy.findFirst({ where: { tenantId: targetTenantId, sourceToyId }, select: { id: true } });
}

async function mappedPositionForTarget(sourcePositionId: string, targetTenantId: string) {
  return prisma.position.findFirst({ where: { tenantId: targetTenantId, sourcePositionId }, select: { id: true } });
}

async function matchingToyForTarget(source: { slug: string; title: string }, targetTenantId: string) {
  return prisma.toy.findFirst({
    where: {
      tenantId: targetTenantId,
      OR: [{ slug: source.slug }, { title: source.title }]
    },
    select: { id: true }
  });
}

async function matchingPositionForTarget(source: { slug: string; name: string }, targetTenantId: string) {
  return prisma.position.findFirst({
    where: {
      tenantId: targetTenantId,
      OR: [{ slug: source.slug }, { name: source.name }]
    },
    select: { id: true }
  });
}

function uniqueIds(ids: string[]) {
  return Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
}

export async function copyCatalogBetweenTenants(options: CopyCatalogOptions): Promise<CopyCatalogResult> {
  const toyIds = uniqueIds(options.toyIds);
  const positionIds = uniqueIds(options.positionIds);
  if (options.sourceTenantId === options.targetTenantId) throw new Error("Quelle und Ziel dürfen nicht identisch sein.");
  if (!toyIds.length && !positionIds.length) throw new Error("Bitte mindestens eine Szene oder Spielsache auswählen.");

  const [actor, sourceTenant, targetTenant] = await Promise.all([
    prisma.user.findUnique({ where: { id: options.actorId }, include: { profile: true } }),
    prisma.tenant.findUnique({ where: { id: options.sourceTenantId } }),
    prisma.tenant.findUnique({ where: { id: options.targetTenantId } })
  ]);
  if (!actor || !sourceTenant || !targetTenant) throw new Error("Quelle, Ziel oder Benutzer wurde nicht gefunden.");

  const result: CopyCatalogResult = {
    copiedToys: 0,
    updatedToys: 0,
    skippedToys: 0,
    copiedPositions: 0,
    updatedPositions: 0,
    skippedPositions: 0
  };
  const toyIdMap = new Map<string, string>();

  const requiredToolIds = positionIds.length
    ? await prisma.position
        .findMany({
          where: { tenantId: options.sourceTenantId, id: { in: positionIds } },
          include: { tools: { select: { id: true } } }
        })
        .then((positions) => positions.flatMap((position) => position.tools.map((tool) => tool.id)))
    : [];
  const sourceToyIds = uniqueIds([...toyIds, ...requiredToolIds]);

  const sourceToys = sourceToyIds.length
    ? await prisma.toy.findMany({
        where: { tenantId: options.sourceTenantId, id: { in: sourceToyIds } },
        include: { category: true },
        orderBy: [{ sortOrder: "asc" }, { title: "asc" }]
      })
    : [];

  for (const toy of sourceToys) {
    const existingMapped = await mappedToyForTarget(toy.id, options.targetTenantId);
    const existingMatching = existingMapped || (options.mode === "missing" ? await matchingToyForTarget(toy, options.targetTenantId) : null);
    if (existingMapped && options.mode === "refresh") {
      const category = await getOrCreateCatalogCategory("toy", options.targetTenantId, toy.category?.name);
      const imageUrl = await copyImageUrl(toy.imageUrl, actor.id, options.targetTenantId);
      const slug = await uniqueSlugForUpdate("toy", normalizeSlug(toy.slug, toy.title), existingMapped.id, options.targetTenantId);
      await prisma.toy.update({
        where: { id: existingMapped.id },
        data: {
          categoryId: category.id,
          title: toy.title,
          slug,
          description: toy.description,
          imageUrl,
          selfBondageCapable: toy.selfBondageCapable,
          sortOrder: toy.sortOrder,
          sourceTenantId: options.sourceTenantId,
          sourceToyId: toy.id
        }
      });
      toyIdMap.set(toy.id, existingMapped.id);
      result.updatedToys += 1;
      continue;
    }
    if (existingMatching && options.mode === "missing") {
      await prisma.toy.update({ where: { id: existingMatching.id }, data: { sourceTenantId: options.sourceTenantId, sourceToyId: toy.id } }).catch(() => null);
      toyIdMap.set(toy.id, existingMatching.id);
      result.skippedToys += 1;
      continue;
    }
    if (existingMapped && options.mode !== "duplicate") {
      toyIdMap.set(toy.id, existingMapped.id);
      result.skippedToys += 1;
      continue;
    }

    const category = await getOrCreateCatalogCategory("toy", options.targetTenantId, toy.category?.name);
    const imageUrl = await copyImageUrl(toy.imageUrl, actor.id, options.targetTenantId);
    const slug = await uniqueSlug("toy", normalizeSlug(toy.slug, toy.title), options.targetTenantId);
    const copied = await prisma.toy.create({
      data: {
        tenantId: options.targetTenantId,
        ownerId: actor.id,
        categoryId: category.id,
        title: toy.title,
        slug,
        description: toy.description,
        imageUrl,
        selfBondageCapable: toy.selfBondageCapable,
        sortOrder: toy.sortOrder,
        sourceTenantId: options.sourceTenantId,
        sourceToyId: toy.id
      },
      select: { id: true }
    });
    toyIdMap.set(toy.id, copied.id);
    result.copiedToys += 1;
  }

  const sourcePositions = positionIds.length
    ? await prisma.position.findMany({
        where: { tenantId: options.sourceTenantId, id: { in: positionIds } },
        include: { category: true, tools: { select: { id: true } } },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
      })
    : [];

  for (const position of sourcePositions) {
    const connectedTools = position.tools
      .map((tool) => toyIdMap.get(tool.id))
      .filter((id): id is string => Boolean(id))
      .map((id) => ({ id }));
    const existingMapped = await mappedPositionForTarget(position.id, options.targetTenantId);
    const existingMatching = existingMapped || (options.mode === "missing" ? await matchingPositionForTarget(position, options.targetTenantId) : null);
    if (existingMapped && options.mode === "refresh") {
      const category = await getOrCreateCatalogCategory("position", options.targetTenantId, position.category?.name);
      const imageUrl = await copyImageUrl(position.imageUrl, actor.id, options.targetTenantId);
      const slug = await uniqueSlugForUpdate("position", normalizeSlug(position.slug, position.name), existingMapped.id, options.targetTenantId);
      await prisma.position.update({
        where: { id: existingMapped.id },
        data: {
          categoryId: category.id,
          name: position.name,
          slug,
          description: position.description,
          imageUrl,
          selfBondageCapable: position.selfBondageCapable,
          sortOrder: position.sortOrder,
          sourceTenantId: options.sourceTenantId,
          sourcePositionId: position.id,
          tools: { set: connectedTools }
        }
      });
      result.updatedPositions += 1;
      continue;
    }
    if (existingMatching && options.mode === "missing") {
      await prisma.position.update({ where: { id: existingMatching.id }, data: { sourceTenantId: options.sourceTenantId, sourcePositionId: position.id } }).catch(() => null);
      result.skippedPositions += 1;
      continue;
    }
    if (existingMapped && options.mode !== "duplicate") {
      result.skippedPositions += 1;
      continue;
    }

    const category = await getOrCreateCatalogCategory("position", options.targetTenantId, position.category?.name);
    const imageUrl = await copyImageUrl(position.imageUrl, actor.id, options.targetTenantId);
    const slug = await uniqueSlug("position", normalizeSlug(position.slug, position.name), options.targetTenantId);
    await prisma.position.create({
      data: {
        tenantId: options.targetTenantId,
        ownerId: actor.id,
        categoryId: category.id,
        name: position.name,
        slug,
        description: position.description,
        imageUrl,
        selfBondageCapable: position.selfBondageCapable,
        sortOrder: position.sortOrder,
        sourceTenantId: options.sourceTenantId,
        sourcePositionId: position.id,
        tools: { connect: connectedTools }
      }
    });
    result.copiedPositions += 1;
  }

  await logAction({
    actorId: actor.id,
    action: options.mode === "refresh" ? "tenant_catalog_refreshed" : "tenant_catalog_copied",
    entityType: "tenant",
    entityId: options.targetTenantId,
    title: `${userDisplayName(actor)} hat Katalogdaten von ${sourceTenant.name} nach ${targetTenant.name} übernommen`,
    href: "/settings/sites",
    details: {
      sourceTenantId: sourceTenant.id,
      sourceTenantName: sourceTenant.name,
      targetTenantId: targetTenant.id,
      targetTenantName: targetTenant.name,
      selectedToyIds: toyIds,
      selectedPositionIds: positionIds,
      mode: options.mode,
      ...result
    }
  });

  return result;
}
