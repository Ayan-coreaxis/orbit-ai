-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "riskLevel" TEXT,
ADD COLUMN     "riskScore" INTEGER,
ADD COLUMN     "riskSignals" TEXT;

-- CreateIndex
CREATE INDEX "Order_customerPhone_idx" ON "Order"("customerPhone");
