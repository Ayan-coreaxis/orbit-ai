-- AlterTable
ALTER TABLE "Order" ADD COLUMN "confirmedAt" DATETIME;
ALTER TABLE "Order" ADD COLUMN "courierName" TEXT;
ALTER TABLE "Order" ADD COLUMN "shippedAt" DATETIME;
ALTER TABLE "Order" ADD COLUMN "trackingNotifiedAt" DATETIME;
ALTER TABLE "Order" ADD COLUMN "trackingNotifyError" TEXT;
ALTER TABLE "Order" ADD COLUMN "trackingNumber" TEXT;
ALTER TABLE "Order" ADD COLUMN "trackingUrl" TEXT;
