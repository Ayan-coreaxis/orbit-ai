ALTER TABLE "Review" ADD COLUMN "productId" TEXT;
ALTER TABLE "Review" ADD COLUMN "customerName" TEXT;
ALTER TABLE "Review" ADD COLUMN "published" BOOLEAN NOT NULL DEFAULT true;
CREATE INDEX "Review_businessId_productId_status_idx" ON "Review"("businessId", "productId", "status");
