CREATE TABLE "TrackerReminderJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "trackerTypeId" TEXT NOT NULL,
    "trackerKey" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "message" TEXT,

    CONSTRAINT "TrackerReminderJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TrackerReminderJob_status_dueAt_idx" ON "TrackerReminderJob"("status", "dueAt");
CREATE INDEX "TrackerReminderJob_userId_trackerTypeId_status_idx" ON "TrackerReminderJob"("userId", "trackerTypeId", "status");
CREATE INDEX "TrackerReminderJob_tenantId_createdAt_idx" ON "TrackerReminderJob"("tenantId", "createdAt");
