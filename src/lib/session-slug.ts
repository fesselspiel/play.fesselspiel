import { prisma } from "@/lib/prisma";

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function sessionSlugBase(startTime: Date) {
  return `session-${startTime.getFullYear()}-${pad(startTime.getMonth() + 1)}-${pad(startTime.getDate())}-${pad(startTime.getHours())}${pad(startTime.getMinutes())}`;
}

export async function uniqueSessionSlug(startTime: Date, currentId?: string, tenantId?: string | null) {
  const base = sessionSlugBase(startTime);
  let slug = base;
  let counter = 2;
  while (true) {
    const existing = await prisma.segufixSession.findFirst({ where: { slug, ...(tenantId ? { tenantId } : {}) } });
    if (!existing || existing.id === currentId) return slug;
    slug = `${base}-${counter++}`;
  }
}

export async function ensureSessionSlug(session: { id: string; slug?: string | null; startTime: Date }) {
  if (session.slug) return session.slug;
  const current = await prisma.segufixSession.findUnique({ where: { id: session.id }, select: { tenantId: true } });
  const slug = await uniqueSessionSlug(session.startTime, session.id, current?.tenantId);
  await prisma.segufixSession.update({ where: { id: session.id }, data: { slug } });
  return slug;
}
