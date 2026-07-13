import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/external-api";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const PublishSchema = z.object({
  documentIds: z.array(z.string().min(1)).length(4)
});

const requiredKinds = ["AGE_NOTICE", "PRIVACY", "TERMS", "COMMUNITY_GUIDELINES"] as const;
const requiredKindSet = new Set<string>(requiredKinds);

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request, { allowUnaccepted: true });
  if ("response" in auth) return auth.response;
  if (auth.user.role !== "ADMIN" && auth.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  if (!auth.user.tenantId) return NextResponse.json({ ok: false, error: "tenant_required" }, { status: 409 });
  const parsed = PublishSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || new Set(parsed.data.documentIds).size !== 4) {
    return NextResponse.json({ ok: false, error: "four_unique_documents_required" }, { status: 400 });
  }

  const [tenant, documents] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: auth.user.tenantId } }),
    prisma.legalDocument.findMany({
      where: { id: { in: parsed.data.documentIds }, tenantId: auth.user.tenantId }
    })
  ]);
  if (!tenant) return NextResponse.json({ ok: false, error: "tenant_not_found" }, { status: 404 });
  const missingContacts = [
    ["legalResponsibleName", tenant.legalResponsibleName],
    ["legalPostalAddress", tenant.legalPostalAddress],
    ["supportEmail", tenant.supportEmail],
    ["moderationEmail", tenant.moderationEmail],
    ["privacyEmail", tenant.privacyEmail],
    ["securityEmail", tenant.securityEmail],
    ["serverRegion", tenant.serverRegion]
  ].filter(([, value]) => !String(value || "").trim()).map(([name]) => name);
  if (missingContacts.length) {
    return NextResponse.json({ ok: false, error: "legal_identity_incomplete", missing: missingContacts }, { status: 409 });
  }
  if (documents.length !== 4 || documents.some((document) => !requiredKindSet.has(document.kind))) {
    return NextResponse.json({ ok: false, error: "required_document_set_incomplete" }, { status: 409 });
  }
  if (new Set(documents.map((document) => document.kind)).size !== requiredKinds.length) {
    return NextResponse.json({ ok: false, error: "one_document_per_kind_required" }, { status: 409 });
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.legalDocument.updateMany({
      where: { tenantId: tenant.id, kind: { in: [...requiredKinds] } },
      data: { active: false }
    }),
    ...documents.map((document) => prisma.legalDocument.update({
      where: { id: document.id },
      data: { active: true, publishedAt: now }
    }))
  ]);
  return NextResponse.json({ ok: true, publishedAt: now.toISOString(), documentIds: documents.map((document) => document.id) });
}
