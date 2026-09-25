-- Business: seller storefront payment + shipping config
ALTER TABLE "Business" ADD COLUMN "stripeWebhookSecret" TEXT;
ALTER TABLE "Business" ADD COLUMN "shippingFee" REAL NOT NULL DEFAULT 0;
ALTER TABLE "Business" ADD COLUMN "freeShippingOver" REAL;

-- AbandonedCart: one row per (business, anonymous session)
CREATE UNIQUE INDEX "AbandonedCart_businessId_sessionId_key" ON "AbandonedCart"("businessId", "sessionId");
