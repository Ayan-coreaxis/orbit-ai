-- CreateTable
CREATE TABLE "GiftCard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "initialValue" REAL NOT NULL,
    "balance" REAL NOT NULL,
    "purchaserCustomerId" TEXT,
    "recipientEmail" TEXT,
    "recipientName" TEXT,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GiftCard_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GiftCard_purchaserCustomerId_fkey" FOREIGN KEY ("purchaserCustomerId") REFERENCES "StoreCustomer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GiftCardTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "giftCardId" TEXT NOT NULL,
    "orderId" TEXT,
    "amount" REAL NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GiftCardTransaction_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GiftCardTransaction_giftCardId_fkey" FOREIGN KEY ("giftCardId") REFERENCES "GiftCard" ("id") ON DELETE CASCADE ON UPDATE CASCADE
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
    "giftCardsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "subscriptionStatus" TEXT,
    CONSTRAINT "Business_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Business" ("agentSettings", "businessModel", "codVerification", "courierApiKey", "courierProvider", "createdAt", "fraudBlocklist", "freeShippingOver", "ga4MeasurementId", "id", "instagram", "lastSeenReportId", "loyaltyEarnRate", "loyaltyEnabled", "loyaltyMinRedeem", "loyaltyRedeemRate", "metaAccessToken", "metaAdAccountId", "metaConnectedAt", "metaInstagramUserId", "metaPageId", "metaPageName", "metaPixelId", "monthlyUsageCapUsd", "name", "niche", "notifyNewOrders", "ownerId", "paymentProvider", "plan", "referralEnabled", "referralRefereePoints", "referralReferrerPoints", "shippingFee", "storeCurrency", "stripeCustomerId", "stripePublishableKey", "stripeSecretKey", "stripeSubscriptionId", "stripeWebhookSecret", "subscriptionStatus", "taxInclusive", "taxLabel", "taxRatePercent", "website", "whatsapp", "whatsappInboundNumber") SELECT "agentSettings", "businessModel", "codVerification", "courierApiKey", "courierProvider", "createdAt", "fraudBlocklist", "freeShippingOver", "ga4MeasurementId", "id", "instagram", "lastSeenReportId", "loyaltyEarnRate", "loyaltyEnabled", "loyaltyMinRedeem", "loyaltyRedeemRate", "metaAccessToken", "metaAdAccountId", "metaConnectedAt", "metaInstagramUserId", "metaPageId", "metaPageName", "metaPixelId", "monthlyUsageCapUsd", "name", "niche", "notifyNewOrders", "ownerId", "paymentProvider", "plan", "referralEnabled", "referralRefereePoints", "referralReferrerPoints", "shippingFee", "storeCurrency", "stripeCustomerId", "stripePublishableKey", "stripeSecretKey", "stripeSubscriptionId", "stripeWebhookSecret", "subscriptionStatus", "taxInclusive", "taxLabel", "taxRatePercent", "website", "whatsapp", "whatsappInboundNumber" FROM "Business";
DROP TABLE "Business";
ALTER TABLE "new_Business" RENAME TO "Business";
CREATE TABLE "new_Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "customerId" TEXT,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "customerEmail" TEXT,
    "address" TEXT NOT NULL,
    "shippingAddress" TEXT,
    "sellerNote" TEXT,
    "items" TEXT NOT NULL,
    "subtotal" REAL NOT NULL DEFAULT 0,
    "shippingFee" REAL NOT NULL DEFAULT 0,
    "taxAmount" REAL NOT NULL DEFAULT 0,
    "total" REAL NOT NULL,
    "couponCode" TEXT,
    "discountAmount" REAL NOT NULL DEFAULT 0,
    "loyaltyPointsRedeemed" INTEGER NOT NULL DEFAULT 0,
    "loyaltyDiscount" REAL NOT NULL DEFAULT 0,
    "loyaltyPointsEarned" INTEGER NOT NULL DEFAULT 0,
    "giftCardCode" TEXT,
    "giftCardDiscount" REAL NOT NULL DEFAULT 0,
    "clientToken" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT true,
    "verifiedAt" DATETIME,
    "verifyToken" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "paymentProvider" TEXT NOT NULL DEFAULT 'cod',
    "paymentStatus" TEXT NOT NULL DEFAULT 'paid',
    "stripeSessionId" TEXT,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "flagReason" TEXT,
    "confirmedAt" DATETIME,
    "confirmationNotifiedAt" DATETIME,
    "confirmationNotifyError" TEXT,
    "courierName" TEXT,
    "trackingNumber" TEXT,
    "trackingUrl" TEXT,
    "shippedAt" DATETIME,
    "fulfilledAt" DATETIME,
    "cancelledAt" DATETIME,
    "trackingNotifiedAt" DATETIME,
    "trackingNotifyError" TEXT,
    "reviewRequestedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Order_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "StoreCustomer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Order" ("address", "businessId", "cancelledAt", "clientToken", "confirmationNotifiedAt", "confirmationNotifyError", "confirmedAt", "couponCode", "courierName", "createdAt", "customerEmail", "customerId", "customerName", "customerPhone", "discountAmount", "flagReason", "flagged", "fulfilledAt", "id", "items", "loyaltyDiscount", "loyaltyPointsEarned", "loyaltyPointsRedeemed", "paymentProvider", "paymentStatus", "reviewRequestedAt", "sellerNote", "shippedAt", "shippingAddress", "shippingFee", "status", "stripeSessionId", "subtotal", "taxAmount", "total", "trackingNotifiedAt", "trackingNotifyError", "trackingNumber", "trackingUrl", "verified", "verifiedAt", "verifyToken") SELECT "address", "businessId", "cancelledAt", "clientToken", "confirmationNotifiedAt", "confirmationNotifyError", "confirmedAt", "couponCode", "courierName", "createdAt", "customerEmail", "customerId", "customerName", "customerPhone", "discountAmount", "flagReason", "flagged", "fulfilledAt", "id", "items", "loyaltyDiscount", "loyaltyPointsEarned", "loyaltyPointsRedeemed", "paymentProvider", "paymentStatus", "reviewRequestedAt", "sellerNote", "shippedAt", "shippingAddress", "shippingFee", "status", "stripeSessionId", "subtotal", "taxAmount", "total", "trackingNotifiedAt", "trackingNotifyError", "trackingNumber", "trackingUrl", "verified", "verifiedAt", "verifyToken" FROM "Order";
DROP TABLE "Order";
ALTER TABLE "new_Order" RENAME TO "Order";
CREATE UNIQUE INDEX "Order_clientToken_key" ON "Order"("clientToken");
CREATE INDEX "Order_businessId_status_idx" ON "Order"("businessId", "status");
CREATE INDEX "Order_businessId_createdAt_idx" ON "Order"("businessId", "createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "GiftCard_code_key" ON "GiftCard"("code");

-- CreateIndex
CREATE INDEX "GiftCard_businessId_idx" ON "GiftCard"("businessId");

-- CreateIndex
CREATE INDEX "GiftCardTransaction_businessId_giftCardId_idx" ON "GiftCardTransaction"("businessId", "giftCardId");

-- CreateIndex
CREATE INDEX "GiftCardTransaction_businessId_orderId_idx" ON "GiftCardTransaction"("businessId", "orderId");
