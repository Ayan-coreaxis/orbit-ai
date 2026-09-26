-- AlterTable
ALTER TABLE "Business" ADD COLUMN "checkoutCustomFields" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "customFieldsData" TEXT;
