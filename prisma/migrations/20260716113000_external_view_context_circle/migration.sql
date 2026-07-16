ALTER TABLE "ExternalViewContext" ADD COLUMN "circleId" TEXT;

CREATE INDEX "ExternalViewContext_circleId_idx" ON "ExternalViewContext"("circleId");
