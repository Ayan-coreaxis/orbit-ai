-- CreateTable
CREATE TABLE "PlatformPayment" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "amountUsd" DOUBLE PRECISION NOT NULL,
    "feeUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "feeEstimated" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL,
    "method" TEXT,
    "plan" TEXT,
    "externalId" TEXT,
    "note" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlatformPayment_externalId_key" ON "PlatformPayment"("externalId");

-- CreateIndex
CREATE INDEX "PlatformPayment_paidAt_idx" ON "PlatformPayment"("paidAt");

-- CreateIndex
CREATE INDEX "PlatformPayment_businessId_paidAt_idx" ON "PlatformPayment"("businessId", "paidAt");

-- CreateIndex
CREATE INDEX "AgentUsage_createdAt_idx" ON "AgentUsage"("createdAt");

-- CreateIndex
CREATE INDEX "AgentUsage_businessId_createdAt_idx" ON "AgentUsage"("businessId", "createdAt");

-- AddForeignKey
ALTER TABLE "PlatformPayment" ADD CONSTRAINT "PlatformPayment_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
