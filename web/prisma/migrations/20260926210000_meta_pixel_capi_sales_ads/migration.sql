-- AlterTable
ALTER TABLE "AdCampaign" ADD COLUMN     "objective" TEXT,
ADD COLUMN     "purchaseValue" DOUBLE PRECISION,
ADD COLUMN     "purchases" INTEGER;

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "metaCapiNote" TEXT,
ADD COLUMN     "metaCapiToken" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "adContext" TEXT,
ADD COLUMN     "capiSentAt" TIMESTAMP(3);
