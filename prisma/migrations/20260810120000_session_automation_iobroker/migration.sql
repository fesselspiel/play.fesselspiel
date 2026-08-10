-- Session automation, rule engine and ioBroker bridge.

CREATE TABLE IF NOT EXISTS "AutomationSession" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "trackerTypeId" TEXT,
  "trackerEntryId" TEXT,
  "slug" TEXT,
  "title" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'IDLE',
  "source" TEXT NOT NULL DEFAULT 'WEB',
  "role" TEXT NOT NULL DEFAULT 'OWNER',
  "correlationId" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3),
  "pendingEndAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "notes" TEXT,
  "stateJson" JSONB NOT NULL DEFAULT '{}',
  "metadataJson" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AutomationSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AutomationRule" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "mode" TEXT NOT NULL DEFAULT 'ONCE',
  "triggerType" TEXT NOT NULL,
  "triggerJson" JSONB NOT NULL DEFAULT '{}',
  "conditionJson" JSONB NOT NULL DEFAULT '[]',
  "timingJson" JSONB NOT NULL DEFAULT '{}',
  "actionJson" JSONB NOT NULL DEFAULT '[]',
  "descriptionText" TEXT NOT NULL DEFAULT '',
  "currentVersion" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AutomationRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AutomationRuleVersion" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "ruleId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "triggerType" TEXT NOT NULL,
  "triggerJson" JSONB NOT NULL DEFAULT '{}',
  "conditionJson" JSONB NOT NULL DEFAULT '[]',
  "timingJson" JSONB NOT NULL DEFAULT '{}',
  "actionJson" JSONB NOT NULL DEFAULT '[]',
  "descriptionText" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AutomationRuleVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AutomationDevice" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "logicalId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "integration" TEXT NOT NULL DEFAULT 'IOBROKER',
  "health" TEXT NOT NULL DEFAULT 'UNKNOWN',
  "statusJson" JSONB NOT NULL DEFAULT '{}',
  "metadataJson" JSONB NOT NULL DEFAULT '{}',
  "lastSeenAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AutomationDevice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AutomationCapability" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'UNKNOWN',
  "stateJson" JSONB NOT NULL DEFAULT '{}',
  "actionsJson" JSONB NOT NULL DEFAULT '[]',
  "eventsJson" JSONB NOT NULL DEFAULT '[]',
  "conditionsJson" JSONB NOT NULL DEFAULT '[]',
  "parametersJson" JSONB NOT NULL DEFAULT '{}',
  "uiJson" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AutomationCapability_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AutomationAction" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "sessionId" TEXT,
  "ruleId" TEXT,
  "ruleVersionId" TEXT,
  "actorId" TEXT,
  "contextId" TEXT,
  "parentActionId" TEXT,
  "deviceId" TEXT,
  "capabilityId" TEXT,
  "type" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'SYSTEM',
  "role" TEXT NOT NULL DEFAULT 'SYSTEM',
  "target" TEXT,
  "status" TEXT NOT NULL DEFAULT 'CREATED',
  "timingJson" JSONB NOT NULL DEFAULT '{}',
  "payloadJson" JSONB NOT NULL DEFAULT '{}',
  "resultJson" JSONB,
  "error" TEXT,
  "idempotencyKey" TEXT,
  "correlationId" TEXT NOT NULL,
  "dueAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AutomationAction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AutomationEvent" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "sessionId" TEXT,
  "ruleId" TEXT,
  "ruleVersionId" TEXT,
  "actionId" TEXT,
  "actorId" TEXT,
  "contextId" TEXT,
  "parentEventId" TEXT,
  "deviceId" TEXT,
  "capabilityId" TEXT,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'SYSTEM',
  "role" TEXT NOT NULL DEFAULT 'SYSTEM',
  "detailsJson" JSONB NOT NULL DEFAULT '{}',
  "rawJson" JSONB NOT NULL DEFAULT '{}',
  "correlationId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AutomationEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AutomationExecutionContext" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "sessionId" TEXT,
  "actorId" TEXT,
  "ruleId" TEXT,
  "ruleVersionId" TEXT,
  "parentContextId" TEXT,
  "source" TEXT NOT NULL DEFAULT 'SYSTEM',
  "role" TEXT NOT NULL DEFAULT 'SYSTEM',
  "variablesJson" JSONB NOT NULL DEFAULT '{}',
  "conditionsJson" JSONB NOT NULL DEFAULT '[]',
  "policyJson" JSONB NOT NULL DEFAULT '{}',
  "timingJson" JSONB NOT NULL DEFAULT '{}',
  "correlationId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AutomationExecutionContext_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AutomationImageRequest" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "actionId" TEXT,
  "requesterId" TEXT,
  "deviceId" TEXT,
  "capabilityId" TEXT,
  "fileId" TEXT,
  "requestId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'REQUESTED',
  "reason" TEXT,
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "maxRetries" INTEGER NOT NULL DEFAULT 2,
  "timeoutSeconds" INTEGER NOT NULL DEFAULT 20,
  "bootDelaySeconds" INTEGER NOT NULL DEFAULT 20,
  "error" TEXT,
  "metadataJson" JSONB NOT NULL DEFAULT '{}',
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "uploadedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AutomationImageRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AutomationBridge" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "mqttBaseTopic" TEXT NOT NULL DEFAULT 'playplaner/v1',
  "mqttClientId" TEXT,
  "mqttUsername" TEXT,
  "mqttPasswordEnc" TEXT,
  "mqttAclJson" JSONB NOT NULL DEFAULT '{}',
  "heartbeatAt" TIMESTAMP(3),
  "health" TEXT NOT NULL DEFAULT 'UNKNOWN',
  "metadataJson" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AutomationBridge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AutomationSession_tenantId_slug_key" ON "AutomationSession"("tenantId", "slug");
CREATE INDEX IF NOT EXISTS "AutomationSession_tenantId_state_idx" ON "AutomationSession"("tenantId", "state");
CREATE INDEX IF NOT EXISTS "AutomationSession_ownerId_state_idx" ON "AutomationSession"("ownerId", "state");
CREATE INDEX IF NOT EXISTS "AutomationSession_trackerEntryId_idx" ON "AutomationSession"("trackerEntryId");
CREATE INDEX IF NOT EXISTS "AutomationSession_correlationId_idx" ON "AutomationSession"("correlationId");

CREATE INDEX IF NOT EXISTS "AutomationRule_tenantId_active_triggerType_idx" ON "AutomationRule"("tenantId", "active", "triggerType");
CREATE INDEX IF NOT EXISTS "AutomationRule_ownerId_active_idx" ON "AutomationRule"("ownerId", "active");
CREATE UNIQUE INDEX IF NOT EXISTS "AutomationRuleVersion_ruleId_version_key" ON "AutomationRuleVersion"("ruleId", "version");
CREATE INDEX IF NOT EXISTS "AutomationRuleVersion_tenantId_createdAt_idx" ON "AutomationRuleVersion"("tenantId", "createdAt");
CREATE INDEX IF NOT EXISTS "AutomationRuleVersion_triggerType_idx" ON "AutomationRuleVersion"("triggerType");

CREATE UNIQUE INDEX IF NOT EXISTS "AutomationDevice_tenantId_logicalId_key" ON "AutomationDevice"("tenantId", "logicalId");
CREATE INDEX IF NOT EXISTS "AutomationDevice_tenantId_health_idx" ON "AutomationDevice"("tenantId", "health");
CREATE UNIQUE INDEX IF NOT EXISTS "AutomationCapability_deviceId_key_key" ON "AutomationCapability"("deviceId", "key");
CREATE INDEX IF NOT EXISTS "AutomationCapability_tenantId_kind_state_idx" ON "AutomationCapability"("tenantId", "kind", "state");

CREATE UNIQUE INDEX IF NOT EXISTS "AutomationAction_tenantId_idempotencyKey_key" ON "AutomationAction"("tenantId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "AutomationAction_tenantId_status_dueAt_idx" ON "AutomationAction"("tenantId", "status", "dueAt");
CREATE INDEX IF NOT EXISTS "AutomationAction_sessionId_createdAt_idx" ON "AutomationAction"("sessionId", "createdAt");
CREATE INDEX IF NOT EXISTS "AutomationAction_correlationId_idx" ON "AutomationAction"("correlationId");
CREATE INDEX IF NOT EXISTS "AutomationAction_deviceId_capabilityId_status_idx" ON "AutomationAction"("deviceId", "capabilityId", "status");

CREATE INDEX IF NOT EXISTS "AutomationEvent_tenantId_createdAt_idx" ON "AutomationEvent"("tenantId", "createdAt");
CREATE INDEX IF NOT EXISTS "AutomationEvent_tenantId_type_createdAt_idx" ON "AutomationEvent"("tenantId", "type", "createdAt");
CREATE INDEX IF NOT EXISTS "AutomationEvent_sessionId_createdAt_idx" ON "AutomationEvent"("sessionId", "createdAt");
CREATE INDEX IF NOT EXISTS "AutomationEvent_correlationId_idx" ON "AutomationEvent"("correlationId");
CREATE INDEX IF NOT EXISTS "AutomationEvent_parentEventId_idx" ON "AutomationEvent"("parentEventId");

CREATE INDEX IF NOT EXISTS "AutomationExecutionContext_tenantId_createdAt_idx" ON "AutomationExecutionContext"("tenantId", "createdAt");
CREATE INDEX IF NOT EXISTS "AutomationExecutionContext_sessionId_createdAt_idx" ON "AutomationExecutionContext"("sessionId", "createdAt");
CREATE INDEX IF NOT EXISTS "AutomationExecutionContext_correlationId_idx" ON "AutomationExecutionContext"("correlationId");
CREATE INDEX IF NOT EXISTS "AutomationExecutionContext_parentContextId_idx" ON "AutomationExecutionContext"("parentContextId");

CREATE UNIQUE INDEX IF NOT EXISTS "AutomationImageRequest_requestId_key" ON "AutomationImageRequest"("requestId");
CREATE INDEX IF NOT EXISTS "AutomationImageRequest_tenantId_status_requestedAt_idx" ON "AutomationImageRequest"("tenantId", "status", "requestedAt");
CREATE INDEX IF NOT EXISTS "AutomationImageRequest_sessionId_requestedAt_idx" ON "AutomationImageRequest"("sessionId", "requestedAt");
CREATE INDEX IF NOT EXISTS "AutomationImageRequest_deviceId_status_idx" ON "AutomationImageRequest"("deviceId", "status");

CREATE UNIQUE INDEX IF NOT EXISTS "AutomationBridge_tenantId_key" ON "AutomationBridge"("tenantId");
CREATE INDEX IF NOT EXISTS "AutomationBridge_enabled_health_idx" ON "AutomationBridge"("enabled", "health");

ALTER TABLE "AutomationSession" ADD CONSTRAINT "AutomationSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationSession" ADD CONSTRAINT "AutomationSession_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationSession" ADD CONSTRAINT "AutomationSession_trackerTypeId_fkey" FOREIGN KEY ("trackerTypeId") REFERENCES "TrackerType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AutomationSession" ADD CONSTRAINT "AutomationSession_trackerEntryId_fkey" FOREIGN KEY ("trackerEntryId") REFERENCES "TrackerEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AutomationRule" ADD CONSTRAINT "AutomationRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationRule" ADD CONSTRAINT "AutomationRule_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationRuleVersion" ADD CONSTRAINT "AutomationRuleVersion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationRuleVersion" ADD CONSTRAINT "AutomationRuleVersion_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AutomationRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AutomationDevice" ADD CONSTRAINT "AutomationDevice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationCapability" ADD CONSTRAINT "AutomationCapability_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationCapability" ADD CONSTRAINT "AutomationCapability_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "AutomationDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AutomationAction" ADD CONSTRAINT "AutomationAction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationAction" ADD CONSTRAINT "AutomationAction_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AutomationSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationAction" ADD CONSTRAINT "AutomationAction_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AutomationRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AutomationAction" ADD CONSTRAINT "AutomationAction_ruleVersionId_fkey" FOREIGN KEY ("ruleVersionId") REFERENCES "AutomationRuleVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AutomationAction" ADD CONSTRAINT "AutomationAction_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AutomationAction" ADD CONSTRAINT "AutomationAction_contextId_fkey" FOREIGN KEY ("contextId") REFERENCES "AutomationExecutionContext"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AutomationAction" ADD CONSTRAINT "AutomationAction_parentActionId_fkey" FOREIGN KEY ("parentActionId") REFERENCES "AutomationAction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AutomationAction" ADD CONSTRAINT "AutomationAction_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "AutomationDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AutomationAction" ADD CONSTRAINT "AutomationAction_capabilityId_fkey" FOREIGN KEY ("capabilityId") REFERENCES "AutomationCapability"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AutomationEvent" ADD CONSTRAINT "AutomationEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationEvent" ADD CONSTRAINT "AutomationEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AutomationSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationEvent" ADD CONSTRAINT "AutomationEvent_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AutomationRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AutomationEvent" ADD CONSTRAINT "AutomationEvent_ruleVersionId_fkey" FOREIGN KEY ("ruleVersionId") REFERENCES "AutomationRuleVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AutomationEvent" ADD CONSTRAINT "AutomationEvent_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "AutomationAction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AutomationEvent" ADD CONSTRAINT "AutomationEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AutomationEvent" ADD CONSTRAINT "AutomationEvent_contextId_fkey" FOREIGN KEY ("contextId") REFERENCES "AutomationExecutionContext"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AutomationEvent" ADD CONSTRAINT "AutomationEvent_parentEventId_fkey" FOREIGN KEY ("parentEventId") REFERENCES "AutomationEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AutomationEvent" ADD CONSTRAINT "AutomationEvent_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "AutomationDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AutomationEvent" ADD CONSTRAINT "AutomationEvent_capabilityId_fkey" FOREIGN KEY ("capabilityId") REFERENCES "AutomationCapability"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AutomationExecutionContext" ADD CONSTRAINT "AutomationExecutionContext_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationExecutionContext" ADD CONSTRAINT "AutomationExecutionContext_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AutomationSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationExecutionContext" ADD CONSTRAINT "AutomationExecutionContext_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AutomationExecutionContext" ADD CONSTRAINT "AutomationExecutionContext_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AutomationRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AutomationExecutionContext" ADD CONSTRAINT "AutomationExecutionContext_ruleVersionId_fkey" FOREIGN KEY ("ruleVersionId") REFERENCES "AutomationRuleVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AutomationExecutionContext" ADD CONSTRAINT "AutomationExecutionContext_parentContextId_fkey" FOREIGN KEY ("parentContextId") REFERENCES "AutomationExecutionContext"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AutomationImageRequest" ADD CONSTRAINT "AutomationImageRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationImageRequest" ADD CONSTRAINT "AutomationImageRequest_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AutomationSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationImageRequest" ADD CONSTRAINT "AutomationImageRequest_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "AutomationAction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AutomationImageRequest" ADD CONSTRAINT "AutomationImageRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AutomationImageRequest" ADD CONSTRAINT "AutomationImageRequest_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "AutomationDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AutomationImageRequest" ADD CONSTRAINT "AutomationImageRequest_capabilityId_fkey" FOREIGN KEY ("capabilityId") REFERENCES "AutomationCapability"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AutomationImageRequest" ADD CONSTRAINT "AutomationImageRequest_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "FileAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AutomationBridge" ADD CONSTRAINT "AutomationBridge_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One-time legacy tracker cleanup: preserve historical rows in generic TrackerEntry,
-- then remove the old dedicated tables and relations.
DO $$
DECLARE
  tenant_record RECORD;
  legacy_session_tracker_id TEXT;
  legacy_time_tracker_id TEXT;
BEGIN
  IF to_regclass('"SegufixSession"') IS NOT NULL THEN
    FOR tenant_record IN
      SELECT DISTINCT COALESCE("tenantId", '') AS tenant_key, "tenantId" FROM "SegufixSession"
    LOOP
      SELECT "id" INTO legacy_session_tracker_id
      FROM "TrackerType"
      WHERE "key" = 'importierter-session-tracker'
        AND (("tenantId" = tenant_record."tenantId") OR ("tenantId" IS NULL AND tenant_record."tenantId" IS NULL))
      LIMIT 1;

      IF legacy_session_tracker_id IS NULL THEN
        legacy_session_tracker_id := concat('clg', substr(md5(random()::text || clock_timestamp()::text), 1, 22));
        INSERT INTO "TrackerType" ("id", "tenantId", "key", "title", "description", "color", "icon", "enabled", "allowOpenSession", "autoCloseOpenSession", "fields", "createdAt", "updatedAt")
        VALUES (
          legacy_session_tracker_id,
          tenant_record."tenantId",
          'importierter-session-tracker',
          'Importierter Session-Tracker',
          'Aus der früheren Session-Tabelle übernommene Einträge.',
          '#E30613',
          'timer',
          true,
          true,
          true,
          '[{"key":"moodBefore","label":"Stimmung vorher","type":"select","scale":true},{"key":"moodAfter","label":"Stimmung nachher","type":"select","scale":true}]'::jsonb,
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        );
      END IF;

      INSERT INTO "TrackerEntry" ("id", "tenantId", "ownerId", "trackerTypeId", "legacyType", "legacyId", "slug", "title", "startTime", "endTime", "durationMinutes", "notes", "fieldValues", "createdAt", "updatedAt")
      SELECT
        concat('cle', substr(md5(s."id" || random()::text), 1, 22)),
        s."tenantId",
        s."ownerId",
        legacy_session_tracker_id,
        'legacy-session',
        s."id",
        COALESCE(s."slug", concat('import-', to_char(s."startTime", 'YYYY-MM-DD-HH24MI'))),
        'Importierter Session-Eintrag',
        s."startTime",
        s."endTime",
        s."durationMinutes",
        concat_ws(E'\n\n',
          s."notes",
          NULLIF(s."moodBeforeText", ''),
          NULLIF(s."moodAfterText", '')
        ),
        jsonb_strip_nulls(jsonb_build_object('moodBefore', s."moodBefore", 'moodAfter', s."moodAfter")),
        s."createdAt",
        s."updatedAt"
      FROM "SegufixSession" s
      WHERE ((s."tenantId" = tenant_record."tenantId") OR (s."tenantId" IS NULL AND tenant_record."tenantId" IS NULL))
        AND NOT EXISTS (
          SELECT 1 FROM "TrackerEntry" e
          WHERE e."trackerTypeId" = legacy_session_tracker_id
            AND e."legacyType" = 'legacy-session'
            AND e."legacyId" = s."id"
        );
    END LOOP;
  END IF;

  IF to_regclass('"KgSession"') IS NOT NULL THEN
    FOR tenant_record IN
      SELECT DISTINCT COALESCE("tenantId", '') AS tenant_key, "tenantId" FROM "KgSession"
    LOOP
      SELECT "id" INTO legacy_time_tracker_id
      FROM "TrackerType"
      WHERE "key" = 'importierter-zeittracker'
        AND (("tenantId" = tenant_record."tenantId") OR ("tenantId" IS NULL AND tenant_record."tenantId" IS NULL))
      LIMIT 1;

      IF legacy_time_tracker_id IS NULL THEN
        legacy_time_tracker_id := concat('clg', substr(md5(random()::text || clock_timestamp()::text), 1, 22));
        INSERT INTO "TrackerType" ("id", "tenantId", "key", "title", "description", "color", "icon", "enabled", "allowOpenSession", "autoCloseOpenSession", "fields", "createdAt", "updatedAt")
        VALUES (
          legacy_time_tracker_id,
          tenant_record."tenantId",
          'importierter-zeittracker',
          'Importierter Zeittracker',
          'Aus der früheren Zeit-Tabelle übernommene Einträge.',
          '#0284C7',
          'clock',
          true,
          true,
          true,
          '[]'::jsonb,
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        );
      END IF;

      INSERT INTO "TrackerEntry" ("id", "tenantId", "ownerId", "trackerTypeId", "legacyType", "legacyId", "slug", "title", "startTime", "endTime", "durationMinutes", "notes", "fieldValues", "createdAt", "updatedAt")
      SELECT
        concat('cle', substr(md5(s."id" || random()::text), 1, 22)),
        s."tenantId",
        s."ownerId",
        legacy_time_tracker_id,
        'legacy-time',
        s."id",
        concat('import-', to_char(s."startTime", 'YYYY-MM-DD-HH24MI')),
        'Importierter Zeit-Eintrag',
        s."startTime",
        s."endTime",
        s."durationMinutes",
        s."notes",
        '{}'::jsonb,
        s."createdAt",
        s."updatedAt"
      FROM "KgSession" s
      WHERE ((s."tenantId" = tenant_record."tenantId") OR (s."tenantId" IS NULL AND tenant_record."tenantId" IS NULL))
        AND NOT EXISTS (
          SELECT 1 FROM "TrackerEntry" e
          WHERE e."trackerTypeId" = legacy_time_tracker_id
            AND e."legacyType" = 'legacy-time'
            AND e."legacyId" = s."id"
        );
    END LOOP;
  END IF;
END $$;

ALTER TABLE "Media" DROP COLUMN IF EXISTS "sessionId";
DROP TABLE IF EXISTS "SessionComment" CASCADE;
DROP TABLE IF EXISTS "SegufixSession" CASCADE;
DROP TABLE IF EXISTS "KgSession" CASCADE;
DROP TYPE IF EXISTS "MoodBefore";
DROP TYPE IF EXISTS "MoodAfter";
