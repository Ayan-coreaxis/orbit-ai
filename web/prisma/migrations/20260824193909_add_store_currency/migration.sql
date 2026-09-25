-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Business" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT,
    "name" TEXT NOT NULL,
    "niche" TEXT NOT NULL,
    "website" TEXT,
    "instagram" TEXT,
    "whatsapp" TEXT,
    "lastSeenReportId" TEXT,
    "agentSettings" TEXT,
    "plan" TEXT NOT NULL DEFAULT 'starter',
    "monthlyUsageCapUsd" REAL DEFAULT 15,
    "taxRatePercent" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metaAccessToken" TEXT,
    "metaPageId" TEXT,
    "metaPageName" TEXT,
    "metaInstagramUserId" TEXT,
    "metaAdAccountId" TEXT,
    "metaConnectedAt" DATETIME,
    "whatsappInboundNumber" TEXT,
    "paymentProvider" TEXT NOT NULL DEFAULT 'cod',
    "stripeSecretKey" TEXT,
    "stripePublishableKey" TEXT,
    "storeCurrency" TEXT NOT NULL DEFAULT 'usd',
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "subscriptionStatus" TEXT,
    CONSTRAINT "Business_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Business" ("agentSettings", "createdAt", "id", "instagram", "lastSeenReportId", "metaAccessToken", "metaAdAccountId", "metaConnectedAt", "metaInstagramUserId", "metaPageId", "metaPageName", "monthlyUsageCapUsd", "name", "niche", "ownerId", "paymentProvider", "plan", "stripeCustomerId", "stripePublishableKey", "stripeSecretKey", "stripeSubscriptionId", "subscriptionStatus", "taxRatePercent", "website", "whatsapp", "whatsappInboundNumber") SELECT "agentSettings", "createdAt", "id", "instagram", "lastSeenReportId", "metaAccessToken", "metaAdAccountId", "metaConnectedAt", "metaInstagramUserId", "metaPageId", "metaPageName", "monthlyUsageCapUsd", "name", "niche", "ownerId", "paymentProvider", "plan", "stripeCustomerId", "stripePublishableKey", "stripeSecretKey", "stripeSubscriptionId", "subscriptionStatus", "taxRatePercent", "website", "whatsapp", "whatsappInboundNumber" FROM "Business";
DROP TABLE "Business";
ALTER TABLE "new_Business" RENAME TO "Business";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
