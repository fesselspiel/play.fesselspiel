-- Additive App Store compliance migration.
-- Apply only after a database backup. This script is intentionally idempotent
-- only at the deployment-ledger level; do not execute it twice manually.

CREATE TYPE "LegalDocumentKind" AS ENUM ('AGE_NOTICE', 'PRIVACY', 'TERMS', 'COMMUNITY_GUIDELINES');
CREATE TYPE "ConsentKind" AS ENUM ('TELEGRAM', 'OPENAI', 'PUSH', 'ANALYTICS');
CREATE TYPE "AccountDeletionStatus" AS ENUM ('REQUESTED', 'REVOKING_ACCESS', 'DELETING_DATA', 'DELETING_FILES', 'COMPLETED', 'FAILED', 'BLOCKED_LAST_ADMIN');
CREATE TYPE "ContentClassification" AS ENUM ('SAFE', 'MATURE_SUGGESTIVE', 'EXPLICIT', 'UNKNOWN', 'QUARANTINED');
CREATE TYPE "ContentScanStatus" AS ENUM ('PENDING', 'CLEAN', 'REJECTED', 'ERROR');
CREATE TYPE "ContentReportReason" AS ENUM ('NUDITY_OR_EXPLICIT', 'NON_CONSENSUAL', 'HARASSMENT_OR_THREAT', 'MINOR_SAFETY', 'VIOLENCE_OR_DANGER', 'ILLEGAL_CONTENT', 'SHARED_WITHOUT_CONSENT', 'SPAM', 'COPYRIGHT', 'OTHER');
CREATE TYPE "ContentReportStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'ESCALATED', 'RESOLVED', 'DISMISSED');
CREATE TYPE "ModerationAction" AS ENUM ('NONE', 'HIDE_CONTENT', 'DELETE_CONTENT', 'WARN_USER', 'SUSPEND_USER', 'DEACTIVATE_USER', 'REMOVE_CIRCLE_ACCESS', 'ESCALATE_SAFETY_LEGAL');

ALTER TABLE "Tenant"
  ADD COLUMN "iosExplicitMediaEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "iosRequiresAgeConfirmation" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "iosOrdersEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "iosProductMode" TEXT NOT NULL DEFAULT 'PRIVATE_ADULT_PLANNER',
  ADD COLUMN "moderationEmail" TEXT,
  ADD COLUMN "privacyEmail" TEXT,
  ADD COLUMN "securityEmail" TEXT,
  ADD COLUMN "supportEmail" TEXT,
  ADD COLUMN "legalResponsibleName" TEXT,
  ADD COLUMN "legalPostalAddress" TEXT,
  ADD COLUMN "serverRegion" TEXT;

ALTER TABLE "User"
  ADD COLUMN "deletionRequestedAt" TIMESTAMP(3),
  ADD COLUMN "sessionRevision" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "FileAsset"
  ADD COLUMN "contentClassification" "ContentClassification" NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "quarantinedAt" TIMESTAMP(3),
  ADD COLUMN "safetyCheckedAt" TIMESTAMP(3),
  ADD COLUMN "scanStatus" "ContentScanStatus" NOT NULL DEFAULT 'PENDING';

ALTER TABLE "UserSettings"
  ADD COLUMN "notificationPreviewMode" TEXT NOT NULL DEFAULT 'DISCREET';

ALTER TABLE "ActivityPlan"
  ADD COLUMN "acceptedVersion" INTEGER,
  ADD COLUMN "consentStatus" TEXT NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "consentUpdatedAt" TIMESTAMP(3),
  ADD COLUMN "consentVersion" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "Media"
  ADD COLUMN "contentClassification" "ContentClassification" NOT NULL DEFAULT 'UNKNOWN';

CREATE TABLE "LegalDocument" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "kind" "LegalDocumentKind" NOT NULL,
  "version" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "required" BOOLEAN NOT NULL DEFAULT true,
  "active" BOOLEAN NOT NULL DEFAULT false,
  "requiresReacceptance" BOOLEAN NOT NULL DEFAULT true,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LegalDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserLegalAcceptance" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "country" TEXT,
  "source" TEXT NOT NULL DEFAULT 'IOS',
  CONSTRAINT "UserLegalAcceptance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserConsentPreference" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "kind" "ConsentKind" NOT NULL,
  "granted" BOOLEAN NOT NULL DEFAULT false,
  "version" TEXT NOT NULL,
  "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "source" TEXT NOT NULL DEFAULT 'IOS',
  CONSTRAINT "UserConsentPreference_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccountDeletionJob" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT,
  "userId" TEXT,
  "requestedUserId" TEXT NOT NULL,
  "status" "AccountDeletionStatus" NOT NULL DEFAULT 'REQUESTED',
  "confirmationMethod" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "fileManifest" JSONB NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccountDeletionJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContentReport" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "reporterId" TEXT NOT NULL,
  "reportedUserId" TEXT,
  "moderatorId" TEXT,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "reason" "ContentReportReason" NOT NULL,
  "details" TEXT,
  "status" "ContentReportStatus" NOT NULL DEFAULT 'OPEN',
  "priority" TEXT NOT NULL DEFAULT 'NORMAL',
  "moderationNote" TEXT,
  "action" "ModerationAction",
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContentReport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ModeratedContent" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "hidden" BOOLEAN NOT NULL DEFAULT true,
  "reason" TEXT,
  "reportId" TEXT,
  "moderatorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ModeratedContent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserBlock" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "blockerId" TEXT NOT NULL,
  "blockedId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserBlock_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LegalDocument_tenantId_kind_active_idx" ON "LegalDocument"("tenantId", "kind", "active");
CREATE UNIQUE INDEX "LegalDocument_tenantId_kind_version_key" ON "LegalDocument"("tenantId", "kind", "version");
CREATE INDEX "UserLegalAcceptance_userId_acceptedAt_idx" ON "UserLegalAcceptance"("userId", "acceptedAt");
CREATE INDEX "UserLegalAcceptance_documentId_acceptedAt_idx" ON "UserLegalAcceptance"("documentId", "acceptedAt");
CREATE UNIQUE INDEX "UserLegalAcceptance_userId_documentId_key" ON "UserLegalAcceptance"("userId", "documentId");
CREATE INDEX "UserConsentPreference_kind_granted_idx" ON "UserConsentPreference"("kind", "granted");
CREATE UNIQUE INDEX "UserConsentPreference_userId_kind_key" ON "UserConsentPreference"("userId", "kind");
CREATE INDEX "AccountDeletionJob_requestedUserId_createdAt_idx" ON "AccountDeletionJob"("requestedUserId", "createdAt");
CREATE INDEX "AccountDeletionJob_status_updatedAt_idx" ON "AccountDeletionJob"("status", "updatedAt");
CREATE INDEX "AccountDeletionJob_tenantId_status_idx" ON "AccountDeletionJob"("tenantId", "status");
CREATE INDEX "ContentReport_tenantId_status_priority_createdAt_idx" ON "ContentReport"("tenantId", "status", "priority", "createdAt");
CREATE INDEX "ContentReport_reporterId_createdAt_idx" ON "ContentReport"("reporterId", "createdAt");
CREATE INDEX "ContentReport_reportedUserId_createdAt_idx" ON "ContentReport"("reportedUserId", "createdAt");
CREATE INDEX "ContentReport_entityType_entityId_idx" ON "ContentReport"("entityType", "entityId");
CREATE UNIQUE INDEX "ModeratedContent_tenantId_entityType_entityId_key" ON "ModeratedContent"("tenantId", "entityType", "entityId");
CREATE INDEX "ModeratedContent_tenantId_hidden_updatedAt_idx" ON "ModeratedContent"("tenantId", "hidden", "updatedAt");
CREATE INDEX "ModeratedContent_reportId_idx" ON "ModeratedContent"("reportId");
CREATE INDEX "UserBlock_tenantId_blockedId_idx" ON "UserBlock"("tenantId", "blockedId");
CREATE INDEX "UserBlock_blockerId_createdAt_idx" ON "UserBlock"("blockerId", "createdAt");
CREATE UNIQUE INDEX "UserBlock_tenantId_blockerId_blockedId_key" ON "UserBlock"("tenantId", "blockerId", "blockedId");

ALTER TABLE "LegalDocument" ADD CONSTRAINT "LegalDocument_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserLegalAcceptance" ADD CONSTRAINT "UserLegalAcceptance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserLegalAcceptance" ADD CONSTRAINT "UserLegalAcceptance_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "LegalDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserConsentPreference" ADD CONSTRAINT "UserConsentPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountDeletionJob" ADD CONSTRAINT "AccountDeletionJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AccountDeletionJob" ADD CONSTRAINT "AccountDeletionJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ContentReport" ADD CONSTRAINT "ContentReport_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentReport" ADD CONSTRAINT "ContentReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentReport" ADD CONSTRAINT "ContentReport_reportedUserId_fkey" FOREIGN KEY ("reportedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ContentReport" ADD CONSTRAINT "ContentReport_moderatorId_fkey" FOREIGN KEY ("moderatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ModeratedContent" ADD CONSTRAINT "ModeratedContent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
