-- AlterTable
ALTER TABLE "Business" ADD COLUMN "customDomain" TEXT;
ALTER TABLE "Business" ADD COLUMN "customDomainCheckedAt" DATETIME;
ALTER TABLE "Business" ADD COLUMN "customDomainNote" TEXT;
ALTER TABLE "Business" ADD COLUMN "customDomainStatus" TEXT;
ALTER TABLE "Business" ADD COLUMN "customDomainToken" TEXT;
ALTER TABLE "Business" ADD COLUMN "customDomainVerifiedAt" DATETIME;
ALTER TABLE "Business" ADD COLUMN "metaUserToken" TEXT;
ALTER TABLE "Business" ADD COLUMN "metaUserTokenExpiresAt" DATETIME;

-- CreateTable
CREATE TABLE "SocialPost" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "mediaId" TEXT,
    "caption" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'posting',
    "externalId" TEXT,
    "permalink" TEXT,
    "error" TEXT,
    "source" TEXT NOT NULL DEFAULT 'owner',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SocialPost_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AdCampaign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "metaCampaignId" TEXT NOT NULL,
    "metaAdSetId" TEXT,
    "metaCreativeId" TEXT,
    "metaAdId" TEXT,
    "name" TEXT NOT NULL,
    "dailyBudgetUsd" REAL,
    "dailyBudget" REAL,
    "currency" TEXT,
    "reasoning" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'paused',
    "metaStatus" TEXT,
    "reviewNote" TEXT,
    "mediaId" TEXT,
    "thumbUrl" TEXT,
    "link" TEXT,
    "headline" TEXT,
    "primaryText" TEXT,
    "callToAction" TEXT,
    "countries" TEXT,
    "endsAt" DATETIME,
    "spend" REAL,
    "impressions" INTEGER,
    "clicks" INTEGER,
    "syncedAt" DATETIME,
    "source" TEXT NOT NULL DEFAULT 'ads-agent',
    "activatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdCampaign_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_AdCampaign" ("activatedAt", "businessId", "createdAt", "dailyBudgetUsd", "id", "metaAdSetId", "metaCampaignId", "name", "reasoning", "status") SELECT "activatedAt", "businessId", "createdAt", "dailyBudgetUsd", "id", "metaAdSetId", "metaCampaignId", "name", "reasoning", "status" FROM "AdCampaign";
DROP TABLE "AdCampaign";
ALTER TABLE "new_AdCampaign" RENAME TO "AdCampaign";
CREATE INDEX "AdCampaign_businessId_status_idx" ON "AdCampaign"("businessId", "status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "SocialPost_businessId_createdAt_idx" ON "SocialPost"("businessId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Business_customDomain_key" ON "Business"("customDomain");

