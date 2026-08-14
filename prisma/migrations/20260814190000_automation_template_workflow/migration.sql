ALTER TABLE "AutomationSessionTemplate"
ADD COLUMN "workflowJson" JSONB NOT NULL DEFAULT '{}';
