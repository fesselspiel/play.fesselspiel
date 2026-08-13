ALTER TABLE "AutomationRule" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;

WITH ordered AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "tenantId" ORDER BY "createdAt", "id") - 1 AS position
  FROM "AutomationRule"
)
UPDATE "AutomationRule" AS rule
SET "sortOrder" = ordered.position
FROM ordered
WHERE rule."id" = ordered."id";

CREATE INDEX IF NOT EXISTS "AutomationRule_tenantId_sortOrder_idx" ON "AutomationRule"("tenantId", "sortOrder");
