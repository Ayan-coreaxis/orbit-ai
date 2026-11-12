-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "whatsappBoss" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "whatsappBossInboundAt" TIMESTAMP(3),
ADD COLUMN     "whatsappBossProposalId" TEXT;
