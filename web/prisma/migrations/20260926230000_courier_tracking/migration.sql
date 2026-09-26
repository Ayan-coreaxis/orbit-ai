-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "courierCheckedAt" TIMESTAMP(3),
ADD COLUMN     "courierStatus" TEXT,
ADD COLUMN     "courierStatusText" TEXT;
