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
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "subscriptionStatus" TEXT,
    CONSTRAINT "Business_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Business" ("agentSettings", "createdAt", "id", "instagram", "lastSeenReportId", "metaAccessToken", "metaAdAccountId", "metaConnectedAt", "metaInstagramUserId", "metaPageId", "metaPageName", "monthlyUsageCapUsd", "name", "niche", "ownerId", "plan", "taxRatePercent", "website", "whatsapp", "whatsappInboundNumber") SELECT "agentSettings", "createdAt", "id", "instagram", "lastSeenReportId", "metaAccessToken", "metaAdAccountId", "metaConnectedAt", "metaInstagramUserId", "metaPageId", "metaPageName", "monthlyUsageCapUsd", "name", "niche", "ownerId", "plan", "taxRatePercent", "website", "whatsapp", "whatsappInboundNumber" FROM "Business";
DROP TABLE "Business";
ALTER TABLE "new_Business" RENAME TO "Business";
CREATE TABLE "new_Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "items" TEXT NOT NULL,
    "total" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "paymentProvider" TEXT NOT NULL DEFAULT 'cod',
    "paymentStatus" TEXT NOT NULL DEFAULT 'paid',
    "stripeSessionId" TEXT,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "flagReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Order_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Order" ("address", "businessId", "createdAt", "customerName", "customerPhone", "flagReason", "flagged", "id", "items", "status", "total") SELECT "address", "businessId", "createdAt", "customerName", "customerPhone", "flagReason", "flagged", "id", "items", "status", "total" FROM "Order";
DROP TABLE "Order";
ALTER TABLE "new_Order" RENAME TO "Order";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
