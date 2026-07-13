import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/external-api";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const DocumentSchema = z.object({
  kind: z.enum(["AGE_NOTICE", "PRIVACY", "TERMS", "COMMUNITY_GUIDELINES"]),
  version: z.string().trim().min(1).max(40),
  title: z.string().trim().min(3).max(160),
  summary: z.string().trim().min(10).max(1000),
  content: z.string().trim().min(100).max(100_000),
  required: z.boolean().default(true),
  requiresReacceptance: z.boolean().default(true)
});

const ContactSchema = z.object({
  legalResponsibleName: z.string().trim().min(2).max(200),
  legalPostalAddress: z.string().trim().min(8).max(1000),
  supportEmail: z.string().trim().email().max(320),
  moderationEmail: z.string().trim().email().max(320),
  privacyEmail: z.string().trim().email().max(320),
  securityEmail: z.string().trim().email().max(320),
  serverRegion: z.string().trim().min(2).max(160),
  iosRequiresAgeConfirmation: z.boolean().optional()
});

function isAdmin(user: { role?: string | null }) {
  return user.role === "ADMIN" || user.role === "SUPER_ADMIN";
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request, { allowUnaccepted: true });
  if ("response" in auth) return auth.response;
  if (!isAdmin(auth.user)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!auth.user.tenantId) return NextResponse.json({ ok: true, items: [] });

  const items = await prisma.legalDocument.findMany({
    where: { tenantId: auth.user.tenantId },
    include: { _count: { select: { acceptances: true } } },
    orderBy: [{ kind: "asc" }, { createdAt: "desc" }]
  });
  return NextResponse.json({
    ok: true,
    items: items.map((item) => ({
      id: item.id,
      kind: item.kind,
      version: item.version,
      title: item.title,
      summary: item.summary,
      content: item.content,
      required: item.required,
      active: item.active,
      requiresReacceptance: item.requiresReacceptance,
      publishedAt: item.publishedAt?.toISOString() || null,
      acceptanceCount: item._count.acceptances,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString()
    }))
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request, { allowUnaccepted: true });
  if ("response" in auth) return auth.response;
  if (!isAdmin(auth.user)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!auth.user.tenantId) return NextResponse.json({ ok: false, error: "tenant_required" }, { status: 409 });
  const parsed = DocumentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });

  const item = await prisma.legalDocument.upsert({
    where: {
      tenantId_kind_version: {
        tenantId: auth.user.tenantId,
        kind: parsed.data.kind,
        version: parsed.data.version
      }
    },
    update: { ...parsed.data, active: false, publishedAt: null },
    create: { tenantId: auth.user.tenantId, ...parsed.data }
  });
  return NextResponse.json({ ok: true, item }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireApiUser(request, { allowUnaccepted: true });
  if ("response" in auth) return auth.response;
  if (!isAdmin(auth.user)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!auth.user.tenantId) return NextResponse.json({ ok: false, error: "tenant_required" }, { status: 409 });
  const parsed = ContactSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_contact_configuration" }, { status: 400 });
  const tenant = await prisma.tenant.update({
    where: { id: auth.user.tenantId },
    data: parsed.data,
    select: {
      id: true,
      legalResponsibleName: true,
      legalPostalAddress: true,
      supportEmail: true,
      moderationEmail: true,
      privacyEmail: true,
      securityEmail: true,
      serverRegion: true,
      iosRequiresAgeConfirmation: true
    }
  });
  return NextResponse.json({ ok: true, tenant });
}
