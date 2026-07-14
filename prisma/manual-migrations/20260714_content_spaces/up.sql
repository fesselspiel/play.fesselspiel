CREATE TYPE "ContentSpaceKind" AS ENUM ('DIARY', 'WIKI', 'IDEAS', 'CUSTOM');
CREATE TYPE "ContentSpaceVisibility" AS ENUM ('PRIVATE', 'USERS', 'CIRCLES', 'SHARED');
CREATE TYPE "ContentSpaceEntrySource" AS ENUM ('WIKI_PAGE', 'IDEA');

CREATE TABLE "ContentSpace" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT,
  "ownerId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "kind" "ContentSpaceKind" NOT NULL DEFAULT 'CUSTOM',
  "icon" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "visibility" "ContentSpaceVisibility" NOT NULL DEFAULT 'PRIVATE',
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContentSpace_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContentSpaceUserShare" (
  "id" TEXT NOT NULL,
  "spaceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContentSpaceUserShare_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContentSpaceCircleShare" (
  "id" TEXT NOT NULL,
  "spaceId" TEXT NOT NULL,
  "circleId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContentSpaceCircleShare_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContentSpaceEntry" (
  "id" TEXT NOT NULL,
  "spaceId" TEXT NOT NULL,
  "sourceType" "ContentSpaceEntrySource" NOT NULL,
  "sourceId" TEXT NOT NULL,
  "calendarDate" TIMESTAMP(3),
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContentSpaceEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContentSpace_tenantId_ownerId_kind_name_key" ON "ContentSpace"("tenantId", "ownerId", "kind", "name");
CREATE INDEX "ContentSpace_tenantId_ownerId_archivedAt_sortOrder_idx" ON "ContentSpace"("tenantId", "ownerId", "archivedAt", "sortOrder");
CREATE INDEX "ContentSpace_visibility_idx" ON "ContentSpace"("visibility");
CREATE UNIQUE INDEX "ContentSpaceUserShare_spaceId_userId_key" ON "ContentSpaceUserShare"("spaceId", "userId");
CREATE INDEX "ContentSpaceUserShare_userId_idx" ON "ContentSpaceUserShare"("userId");
CREATE UNIQUE INDEX "ContentSpaceCircleShare_spaceId_circleId_key" ON "ContentSpaceCircleShare"("spaceId", "circleId");
CREATE INDEX "ContentSpaceCircleShare_circleId_idx" ON "ContentSpaceCircleShare"("circleId");
CREATE UNIQUE INDEX "ContentSpaceEntry_sourceType_sourceId_key" ON "ContentSpaceEntry"("sourceType", "sourceId");
CREATE INDEX "ContentSpaceEntry_spaceId_sortOrder_createdAt_idx" ON "ContentSpaceEntry"("spaceId", "sortOrder", "createdAt");
CREATE INDEX "ContentSpaceEntry_calendarDate_idx" ON "ContentSpaceEntry"("calendarDate");

ALTER TABLE "ContentSpace" ADD CONSTRAINT "ContentSpace_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentSpace" ADD CONSTRAINT "ContentSpace_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentSpaceUserShare" ADD CONSTRAINT "ContentSpaceUserShare_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "ContentSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentSpaceUserShare" ADD CONSTRAINT "ContentSpaceUserShare_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentSpaceCircleShare" ADD CONSTRAINT "ContentSpaceCircleShare_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "ContentSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentSpaceCircleShare" ADD CONSTRAINT "ContentSpaceCircleShare_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentSpaceEntry" ADD CONSTRAINT "ContentSpaceEntry_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "ContentSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
