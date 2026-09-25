-- AlterTable
ALTER TABLE "StoreEvent" ADD COLUMN "referrer" TEXT;

-- CreateIndex
CREATE INDEX "StoreEvent_businessId_createdAt_idx" ON "StoreEvent"("businessId", "createdAt");
