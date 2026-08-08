ALTER TABLE "NativePushDevice"
ADD COLUMN "appIdentifier" TEXT NOT NULL DEFAULT 'fspiel.playplaner';

CREATE INDEX "NativePushDevice_tenantId_appIdentifier_disabledAt_idx"
ON "NativePushDevice"("tenantId", "appIdentifier", "disabledAt");

ALTER TABLE "TrackerType"
ADD COLUMN "quotaReminderIntervalMinutes" INTEGER NOT NULL DEFAULT 1440;
