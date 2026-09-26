-- AlterTable
ALTER TABLE "Order" ADD COLUMN "confirmationNotifiedAt" DATETIME;
ALTER TABLE "Order" ADD COLUMN "confirmationNotifyError" TEXT;
