CREATE TABLE "ContentSpace" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT,
  "ownerId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'custom',
  "templateKey" TEXT,
  "icon" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "visibility" TEXT NOT NULL DEFAULT 'PRIVATE',
  "allowedUserIds" JSONB NOT NULL DEFAULT '[]',
  "allowedCircleIds" JSONB NOT NULL DEFAULT '[]',
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContentSpace_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContentEntry" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT,
  "ownerId" TEXT NOT NULL,
  "spaceId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL DEFAULT '',
  "calendarDate" TIMESTAMP(3),
  "visibility" TEXT,
  "sourceType" TEXT,
  "sourceId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContentEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContentEntryAttachment" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT,
  "entryId" TEXT NOT NULL,
  "fileId" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "title" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContentEntryAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContentSpace_tenantId_ownerId_archivedAt_sortOrder_idx" ON "ContentSpace"("tenantId", "ownerId", "archivedAt", "sortOrder");
CREATE INDEX "ContentSpace_tenantId_visibility_idx" ON "ContentSpace"("tenantId", "visibility");
CREATE INDEX "ContentEntry_tenantId_ownerId_updatedAt_idx" ON "ContentEntry"("tenantId", "ownerId", "updatedAt");
CREATE INDEX "ContentEntry_spaceId_calendarDate_idx" ON "ContentEntry"("spaceId", "calendarDate");
CREATE INDEX "ContentEntry_sourceType_sourceId_idx" ON "ContentEntry"("sourceType", "sourceId");
CREATE INDEX "ContentEntryAttachment_tenantId_ownerId_createdAt_idx" ON "ContentEntryAttachment"("tenantId", "ownerId", "createdAt");
CREATE INDEX "ContentEntryAttachment_entryId_createdAt_idx" ON "ContentEntryAttachment"("entryId", "createdAt");
CREATE INDEX "ContentEntryAttachment_fileId_idx" ON "ContentEntryAttachment"("fileId");

ALTER TABLE "ContentSpace" ADD CONSTRAINT "ContentSpace_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentSpace" ADD CONSTRAINT "ContentSpace_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentEntry" ADD CONSTRAINT "ContentEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentEntry" ADD CONSTRAINT "ContentEntry_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentEntry" ADD CONSTRAINT "ContentEntry_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "ContentSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentEntryAttachment" ADD CONSTRAINT "ContentEntryAttachment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentEntryAttachment" ADD CONSTRAINT "ContentEntryAttachment_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "ContentEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentEntryAttachment" ADD CONSTRAINT "ContentEntryAttachment_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "FileAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentEntryAttachment" ADD CONSTRAINT "ContentEntryAttachment_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
