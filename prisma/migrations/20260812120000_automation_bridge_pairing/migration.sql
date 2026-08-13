CREATE TABLE "AutomationBridgePairing" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT,
  "approvedById" TEXT,
  "apiTokenId" TEXT,
  "installationId" TEXT NOT NULL,
  "installationName" TEXT,
  "requestedHostname" TEXT NOT NULL,
  "requestedOrigin" TEXT NOT NULL,
  "pollSecretHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "trackerTypeId" TEXT,
  "credentialEnc" TEXT,
  "mqttPasswordEnc" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "approvedAt" TIMESTAMP(3),
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AutomationBridgePairing_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AutomationBridgePairing_pollSecretHash_key" ON "AutomationBridgePairing"("pollSecretHash");
CREATE UNIQUE INDEX "AutomationBridgePairing_apiTokenId_key" ON "AutomationBridgePairing"("apiTokenId");
CREATE INDEX "AutomationBridgePairing_status_expiresAt_idx" ON "AutomationBridgePairing"("status", "expiresAt");
CREATE INDEX "AutomationBridgePairing_tenantId_createdAt_idx" ON "AutomationBridgePairing"("tenantId", "createdAt");
CREATE INDEX "AutomationBridgePairing_installationId_createdAt_idx" ON "AutomationBridgePairing"("installationId", "createdAt");

ALTER TABLE "AutomationBridgePairing" ADD CONSTRAINT "AutomationBridgePairing_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationBridgePairing" ADD CONSTRAINT "AutomationBridgePairing_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AutomationBridgePairing" ADD CONSTRAINT "AutomationBridgePairing_apiTokenId_fkey" FOREIGN KEY ("apiTokenId") REFERENCES "ApiToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AutomationBridgePairing" ADD CONSTRAINT "AutomationBridgePairing_trackerTypeId_fkey" FOREIGN KEY ("trackerTypeId") REFERENCES "TrackerType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
