-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "easypaisaHashKey" TEXT,
ADD COLUMN     "easypaisaSandbox" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "easypaisaStoreId" TEXT,
ADD COLUMN     "jazzcashIntegritySalt" TEXT,
ADD COLUMN     "jazzcashMerchantId" TEXT,
ADD COLUMN     "jazzcashPassword" TEXT,
ADD COLUMN     "jazzcashSandbox" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "paymentRef" TEXT;
