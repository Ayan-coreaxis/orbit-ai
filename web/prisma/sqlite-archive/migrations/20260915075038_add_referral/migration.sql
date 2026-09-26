-- CreateTable
CREATE TABLE "ReferralCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReferralCode_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReferralCode_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "StoreCustomer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Referral" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "referralCodeId" TEXT NOT NULL,
    "referrerCustomerId" TEXT NOT NULL,
    "refereeCustomerId" TEXT NOT NULL,
    "qualifyingOrderId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "rewardedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Referral_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Referral_referralCodeId_fkey" FOREIGN KEY ("referralCodeId") REFERENCES "ReferralCode" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Referral_referrerCustomerId_fkey" FOREIGN KEY ("referrerCustomerId") REFERENCES "StoreCustomer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Referral_refereeCustomerId_fkey" FOREIGN KEY ("refereeCustomerId") REFERENCES "StoreCustomer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Business" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT,
    "name" TEXT NOT NULL,
    "niche" TEXT NOT NULL,
    "businessModel" TEXT,
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
    "stripeWebhookSecret" TEXT,
    "storeCurrency" TEXT NOT NULL DEFAULT 'usd',
    "shippingFee" REAL NOT NULL DEFAULT 0,
    "freeShippingOver" REAL,
    "taxInclusive" BOOLEAN NOT NULL DEFAULT false,
    "taxLabel" TEXT DEFAULT 'Tax',
    "codVerification" BOOLEAN NOT NULL DEFAULT false,
    "notifyNewOrders" BOOLEAN NOT NULL DEFAULT true,
    "fraudBlocklist" TEXT,
    "courierProvider" TEXT,
    "courierApiKey" TEXT,
    "ga4MeasurementId" TEXT,
    "metaPixelId" TEXT,
    "loyaltyEnabled" BOOLEAN NOT NULL DEFAULT false,
    "loyaltyEarnRate" REAL NOT NULL DEFAULT 1,
    "loyaltyRedeemRate" REAL NOT NULL DEFAULT 0.01,
    "loyaltyMinRedeem" INTEGER NOT NULL DEFAULT 100,
    "referralEnabled" BOOLEAN NOT NULL DEFAULT false,
    "referralReferrerPoints" INTEGER NOT NULL DEFAULT 200,
    "referralRefereePoints" INTEGER NOT NULL DEFAULT 100,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "subscriptionStatus" TEXT,
    CONSTRAINT "Business_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Business" ("agentSettings", "businessModel", "codVerification", "courierApiKey", "courierProvider", "createdAt", "fraudBlocklist", "freeShippingOver", "ga4MeasurementId", "id", "instagram", "lastSeenReportId", "loyaltyEarnRate", "loyaltyEnabled", "loyaltyMinRedeem", "loyaltyRedeemRate", "metaAccessToken", "metaAdAccountId", "metaConnectedAt", "metaInstagramUserId", "metaPageId", "metaPageName", "metaPixelId", "monthlyUsageCapUsd", "name", "niche", "notifyNewOrders", "ownerId", "paymentProvider", "plan", "shippingFee", "storeCurrency", "stripeCustomerId", "stripePublishableKey", "stripeSecretKey", "stripeSubscriptionId", "stripeWebhookSecret", "subscriptionStatus", "taxInclusive", "taxLabel", "taxRatePercent", "website", "whatsapp", "whatsappInboundNumber") SELECT "agentSettings", "businessModel", "codVerification", "courierApiKey", "courierProvider", "createdAt", "fraudBlocklist", "freeShippingOver", "ga4MeasurementId", "id", "instagram", "lastSeenReportId", "loyaltyEarnRate", "loyaltyEnabled", "loyaltyMinRedeem", "loyaltyRedeemRate", "metaAccessToken", "metaAdAccountId", "metaConnectedAt", "metaInstagramUserId", "metaPageId", "metaPageName", "metaPixelId", "monthlyUsageCapUsd", "name", "niche", "notifyNewOrders", "ownerId", "paymentProvider", "plan", "shippingFee", "storeCurrency", "stripeCustomerId", "stripePublishableKey", "stripeSecretKey", "stripeSubscriptionId", "stripeWebhookSecret", "subscriptionStatus", "taxInclusive", "taxLabel", "taxRatePercent", "website", "whatsapp", "whatsappInboundNumber" FROM "Business";
DROP TABLE "Business";
ALTER TABLE "new_Business" RENAME TO "Business";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "ReferralCode_customerId_key" ON "ReferralCode"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralCode_code_key" ON "ReferralCode"("code");

-- CreateIndex
CREATE INDEX "ReferralCode_businessId_idx" ON "ReferralCode"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "Referral_refereeCustomerId_key" ON "Referral"("refereeCustomerId");

-- CreateIndex
CREATE INDEX "Referral_businessId_referrerCustomerId_idx" ON "Referral"("businessId", "referrerCustomerId");

-- CreateIndex
CREATE INDEX "Referral_businessId_status_idx" ON "Referral"("businessId", "status");
