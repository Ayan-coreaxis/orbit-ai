-- AlterTable
ALTER TABLE "MediaAsset" ADD COLUMN "hash" TEXT;

-- CreateIndex
CREATE INDEX "MediaAsset_businessId_hash_idx" ON "MediaAsset"("businessId", "hash");
