-- AlterTable
ALTER TABLE "Order" ADD COLUMN "cancelledAt" DATETIME;
ALTER TABLE "Order" ADD COLUMN "customerEmail" TEXT;
ALTER TABLE "Order" ADD COLUMN "fulfilledAt" DATETIME;
ALTER TABLE "Order" ADD COLUMN "reviewRequestedAt" DATETIME;
ALTER TABLE "Order" ADD COLUMN "sellerNote" TEXT;

-- CreateIndex
CREATE INDEX "Order_businessId_status_idx" ON "Order"("businessId", "status");

-- CreateIndex
CREATE INDEX "Order_businessId_createdAt_idx" ON "Order"("businessId", "createdAt");
