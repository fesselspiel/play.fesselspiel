CREATE TABLE "AutomationSessionTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "defaultTrackerTypeId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AutomationSessionTemplate_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AutomationSession" ADD COLUMN "templateId" TEXT;
ALTER TABLE "AutomationRule" ADD COLUMN "templateId" TEXT;

CREATE UNIQUE INDEX "AutomationSessionTemplate_tenantId_name_key" ON "AutomationSessionTemplate"("tenantId", "name");
CREATE INDEX "AutomationSessionTemplate_tenantId_active_sortOrder_idx" ON "AutomationSessionTemplate"("tenantId", "active", "sortOrder");
CREATE INDEX "AutomationSessionTemplate_ownerId_idx" ON "AutomationSessionTemplate"("ownerId");
CREATE INDEX "AutomationSessionTemplate_defaultTrackerTypeId_idx" ON "AutomationSessionTemplate"("defaultTrackerTypeId");
CREATE INDEX "AutomationSession_templateId_state_idx" ON "AutomationSession"("templateId", "state");
CREATE INDEX "AutomationRule_templateId_sortOrder_idx" ON "AutomationRule"("templateId", "sortOrder");

ALTER TABLE "AutomationSessionTemplate" ADD CONSTRAINT "AutomationSessionTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationSessionTemplate" ADD CONSTRAINT "AutomationSessionTemplate_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationSessionTemplate" ADD CONSTRAINT "AutomationSessionTemplate_defaultTrackerTypeId_fkey" FOREIGN KEY ("defaultTrackerTypeId") REFERENCES "TrackerType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AutomationSession" ADD CONSTRAINT "AutomationSession_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "AutomationSessionTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AutomationRule" ADD CONSTRAINT "AutomationRule_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "AutomationSessionTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
