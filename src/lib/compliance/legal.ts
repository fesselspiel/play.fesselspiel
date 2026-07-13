import type { ConsentKind, LegalDocumentKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const consentKinds: ConsentKind[] = ["TELEGRAM", "OPENAI", "PUSH", "ANALYTICS"];

export async function complianceStatusForUser(userId: string, tenantId?: string | null) {
  if (!tenantId) {
    return {
      configured: false,
      accessGranted: true,
      ageConfirmed: false,
      documents: [],
      pendingDocuments: [],
      consents: consentKinds.map((kind) => ({ kind, granted: false, version: null, changedAt: null }))
    };
  }

  const [tenant, documents, acceptances, preferences] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { iosRequiresAgeConfirmation: true }
    }),
    prisma.legalDocument.findMany({
      where: { tenantId, active: true, publishedAt: { not: null } },
      orderBy: [{ kind: "asc" }, { publishedAt: "desc" }]
    }),
    prisma.userLegalAcceptance.findMany({
      where: { userId, document: { tenantId, active: true, publishedAt: { not: null } } },
      select: { documentId: true, acceptedAt: true, country: true, source: true }
    }),
    prisma.userConsentPreference.findMany({ where: { userId } })
  ]);

  const acceptanceByDocument = new Map(acceptances.map((entry) => [entry.documentId, entry]));
  const latestByKind = new Map<LegalDocumentKind, (typeof documents)[number]>();
  for (const document of documents) {
    if (!latestByKind.has(document.kind)) latestByKind.set(document.kind, document);
  }
  const currentDocuments = [...latestByKind.values()];
  const serializedDocuments = currentDocuments.map((document) => {
    const acceptance = acceptanceByDocument.get(document.id);
    return {
      id: document.id,
      kind: document.kind,
      version: document.version,
      title: document.title,
      summary: document.summary,
      content: document.content,
      required: document.required,
      accepted: Boolean(acceptance),
      acceptedAt: acceptance?.acceptedAt.toISOString() || null,
      publishedAt: document.publishedAt?.toISOString() || null
    };
  });
  const ageConfirmationRequired = tenant?.iosRequiresAgeConfirmation ?? false;
  const pendingDocuments = serializedDocuments.filter((document) => (
    document.required
    && !document.accepted
    && (document.kind !== "AGE_NOTICE" || ageConfirmationRequired)
  ));
  const ageDocument = serializedDocuments.find((document) => document.kind === "AGE_NOTICE");
  const preferenceByKind = new Map(preferences.map((entry) => [entry.kind, entry]));

  return {
    configured: currentDocuments.some((document) => document.required),
    accessGranted: pendingDocuments.length === 0,
    ageConfirmationRequired,
    ageConfirmed: Boolean(ageDocument?.accepted),
    documents: serializedDocuments,
    pendingDocuments,
    consents: consentKinds.map((kind) => {
      const preference = preferenceByKind.get(kind);
      return {
        kind,
        granted: preference?.granted || false,
        version: preference?.version || null,
        changedAt: preference?.changedAt.toISOString() || null
      };
    })
  };
}

export async function acceptLegalDocuments(input: {
  userId: string;
  tenantId: string;
  documentIds: string[];
  ageConfirmed: boolean;
  country?: string | null;
  source?: string | null;
}) {
  const uniqueIds = [...new Set(input.documentIds.filter(Boolean))];
  const documents = await prisma.legalDocument.findMany({
    where: {
      id: { in: uniqueIds },
      tenantId: input.tenantId,
      active: true,
      publishedAt: { not: null }
    },
    select: { id: true, kind: true }
  });
  if (documents.length !== uniqueIds.length) throw new Error("invalid_legal_document");
  const tenant = await prisma.tenant.findUnique({
    where: { id: input.tenantId },
    select: { iosRequiresAgeConfirmation: true }
  });
  if (tenant?.iosRequiresAgeConfirmation && documents.some((document) => document.kind === "AGE_NOTICE") && !input.ageConfirmed) {
    throw new Error("age_confirmation_required");
  }

  await prisma.$transaction(documents.map((document) => prisma.userLegalAcceptance.upsert({
    where: { userId_documentId: { userId: input.userId, documentId: document.id } },
    update: {
      acceptedAt: new Date(),
      country: input.country || null,
      source: input.source || "IOS"
    },
    create: {
      userId: input.userId,
      documentId: document.id,
      country: input.country || null,
      source: input.source || "IOS"
    }
  })));
  return complianceStatusForUser(input.userId, input.tenantId);
}

export async function setConsentPreference(input: {
  userId: string;
  kind: ConsentKind;
  granted: boolean;
  version: string;
  source?: string | null;
}) {
  return prisma.userConsentPreference.upsert({
    where: { userId_kind: { userId: input.userId, kind: input.kind } },
    update: {
      granted: input.granted,
      version: input.version,
      changedAt: new Date(),
      source: input.source || "IOS"
    },
    create: {
      userId: input.userId,
      kind: input.kind,
      granted: input.granted,
      version: input.version,
      source: input.source || "IOS"
    }
  });
}
