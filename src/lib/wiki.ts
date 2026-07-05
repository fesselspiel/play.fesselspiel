import type { Prisma, Visibility } from "@prisma/client";
import { accessibleOwnerIds, type AccessUser } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { normalizeSlug, slugify } from "@/lib/slug";

export function wikiOwnerSlug(user: {
  username?: string | null;
  profile?: { displayName?: string | null } | null;
  name?: string | null;
  email?: string | null;
}) {
  return slugify(user.profile?.displayName || user.name || user.username || user.email?.split("@")[0] || "benutzer");
}

export async function wikiOwnerBySlug(ownerSlug: string, viewer: AccessUser) {
  const ownerIds = await accessibleOwnerIds(viewer);
  const users = await prisma.user.findMany({
    where: { id: { in: ownerIds }, active: true, ...(viewer.tenantId ? { memberships: { some: { tenantId: viewer.tenantId, active: true } } } : {}) },
    include: { profile: true }
  });
  return users.find((entry) => wikiOwnerSlug(entry) === ownerSlug) || null;
}

export async function wikiPageAccessWhere(user: AccessUser): Promise<Prisma.WikiPageWhereInput> {
  if (user.role === "ADMIN" || user.role === "SUPER_ADMIN") {
    return { ...(user.tenantId ? { tenantId: user.tenantId } : {}), ownerId: { in: await accessibleOwnerIds(user) } };
  }
  const ownerIds = await accessibleOwnerIds(user);
  const otherOwnerIds = ownerIds.filter((id) => id !== user.id);
  return {
    ...(user.tenantId ? { tenantId: user.tenantId } : {}),
    OR: [
      { ownerId: user.id },
      { visibility: "SHARED" },
      ...(user.circleId ? [{ ownerId: { in: otherOwnerIds }, visibility: "PARTNER" as Visibility }] : []),
      { shares: { some: { targetUserId: user.id } } },
      ...(user.circleId ? [{ shares: { some: { targetCircleId: user.circleId } } }] : [])
    ]
  };
}

export async function wikiEditablePage(user: AccessUser, pageId: string) {
  return prisma.wikiPage.findFirst({
    where: {
      id: pageId,
      ...(user.tenantId ? { tenantId: user.tenantId } : {}),
      ...(user.role === "ADMIN" || user.role === "SUPER_ADMIN" ? {} : { ownerId: user.id })
    },
    include: { shares: true, owner: { include: { profile: true } } }
  });
}

export async function uniqueWikiSlug(ownerId: string, tenantId: string | null | undefined, value: string, fallback: string, currentId?: string) {
  const base = normalizeSlug(value, fallback);
  let slug = base;
  let counter = 2;
  while (true) {
    const existing = await prisma.wikiPage.findFirst({
      where: { ownerId, slug, ...(tenantId ? { tenantId } : {}) },
      select: { id: true }
    });
    if (!existing || existing.id === currentId) return slug;
    slug = `${base}-${counter++}`;
  }
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inlineWiki(value: string, ownerSlug: string) {
  return escapeHtml(value)
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, (_match, target, label) => `<a class="text-redbrand font-semibold hover:underline" href="/wiki/${ownerSlug}/${slugify(target)}">${escapeHtml(label)}</a>`)
    .replace(/\[\[([^\]]+)\]\]/g, (_match, target) => `<a class="text-redbrand font-semibold hover:underline" href="/wiki/${ownerSlug}/${slugify(target)}">${escapeHtml(target)}</a>`)
    .replace(/'''([^']+)'''/g, "<strong>$1</strong>")
    .replace(/''([^']+)''/g, "<em>$1</em>");
}

export function renderWikiHtml(content: string, ownerSlug: string) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let listOpen: "ul" | "ol" | null = null;
  function closeList() {
    if (listOpen) html.push(`</${listOpen}>`);
    listOpen = null;
  }
  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      closeList();
      continue;
    }
    const heading = line.match(/^(={2,4})\s*(.*?)\s*\1$/);
    if (heading) {
      closeList();
      const level = heading[1].length;
      html.push(`<h${level} class="mt-6 text-${level === 2 ? "xl" : "lg"} font-semibold text-ink">${inlineWiki(heading[2], ownerSlug)}</h${level}>`);
      continue;
    }
    const bullet = line.match(/^([*#])\s+(.*)$/);
    if (bullet) {
      const tag = bullet[1] === "*" ? "ul" : "ol";
      if (listOpen !== tag) {
        closeList();
        html.push(`<${tag} class="ml-5 list-${tag === "ul" ? "disc" : "decimal"} space-y-1 text-graphite">`);
        listOpen = tag;
      }
      html.push(`<li>${inlineWiki(bullet[2], ownerSlug)}</li>`);
      continue;
    }
    closeList();
    html.push(`<p class="leading-7 text-graphite">${inlineWiki(line, ownerSlug)}</p>`);
  }
  closeList();
  return html.join("\n");
}

export function wikiExportText(page: { title: string; summary?: string | null; content: string }) {
  const summary = page.summary ? `<!-- summary: ${page.summary.replace(/-->/g, "")} -->\n\n` : "";
  return `= ${page.title} =\n\n${summary}${page.content}`;
}

export async function createWikiRevision(pageId: string, actorId: string | null | undefined, action: string) {
  const page = await prisma.wikiPage.findUnique({ where: { id: pageId } });
  if (!page) return;
  await prisma.wikiPageRevision.create({
    data: {
      pageId: page.id,
      actorId: actorId || null,
      title: page.title,
      slug: page.slug,
      summary: page.summary,
      content: page.content,
      action
    }
  });
}
