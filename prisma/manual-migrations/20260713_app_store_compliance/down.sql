-- Emergency rollback for the additive compliance schema.
-- Never run after production acceptances, reports or deletion jobs exist without
-- exporting them and obtaining explicit approval. Account deletions themselves
-- cannot and must not be restored by this script.

DROP TABLE IF EXISTS "UserBlock";
DROP TABLE IF EXISTS "ModeratedContent";
DROP TABLE IF EXISTS "ContentReport";
DROP TABLE IF EXISTS "AccountDeletionJob";
DROP TABLE IF EXISTS "UserConsentPreference";
DROP TABLE IF EXISTS "UserLegalAcceptance";
DROP TABLE IF EXISTS "LegalDocument";

ALTER TABLE "Media" DROP COLUMN IF EXISTS "contentClassification";
ALTER TABLE "ActivityPlan"
  DROP COLUMN IF EXISTS "acceptedVersion",
  DROP COLUMN IF EXISTS "consentStatus",
  DROP COLUMN IF EXISTS "consentUpdatedAt",
  DROP COLUMN IF EXISTS "consentVersion";
ALTER TABLE "UserSettings" DROP COLUMN IF EXISTS "notificationPreviewMode";
ALTER TABLE "FileAsset"
  DROP COLUMN IF EXISTS "contentClassification",
  DROP COLUMN IF EXISTS "quarantinedAt",
  DROP COLUMN IF EXISTS "safetyCheckedAt",
  DROP COLUMN IF EXISTS "scanStatus";
ALTER TABLE "User"
  DROP COLUMN IF EXISTS "deletionRequestedAt",
  DROP COLUMN IF EXISTS "sessionRevision";
ALTER TABLE "Tenant"
  DROP COLUMN IF EXISTS "iosExplicitMediaEnabled",
  DROP COLUMN IF EXISTS "iosRequiresAgeConfirmation",
  DROP COLUMN IF EXISTS "iosOrdersEnabled",
  DROP COLUMN IF EXISTS "iosProductMode",
  DROP COLUMN IF EXISTS "moderationEmail",
  DROP COLUMN IF EXISTS "privacyEmail",
  DROP COLUMN IF EXISTS "securityEmail",
  DROP COLUMN IF EXISTS "supportEmail",
  DROP COLUMN IF EXISTS "legalResponsibleName",
  DROP COLUMN IF EXISTS "legalPostalAddress",
  DROP COLUMN IF EXISTS "serverRegion";

DROP TYPE IF EXISTS "ModerationAction";
DROP TYPE IF EXISTS "ContentReportStatus";
DROP TYPE IF EXISTS "ContentReportReason";
DROP TYPE IF EXISTS "ContentScanStatus";
DROP TYPE IF EXISTS "ContentClassification";
DROP TYPE IF EXISTS "AccountDeletionStatus";
DROP TYPE IF EXISTS "ConsentKind";
DROP TYPE IF EXISTS "LegalDocumentKind";
