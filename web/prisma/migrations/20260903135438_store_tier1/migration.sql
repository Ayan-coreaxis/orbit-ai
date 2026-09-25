-- Order: verification, structured address, tax/shipping breakdown, idempotency
ALTER TABLE "Order" ADD COLUMN "shippingAddress" TEXT;
ALTER TABLE "Order" ADD COLUMN "subtotal" REAL NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN "shippingFee" REAL NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN "taxAmount" REAL NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN "clientToken" TEXT;
ALTER TABLE "Order" ADD COLUMN "verified" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Order" ADD COLUMN "verifiedAt" DATETIME;
ALTER TABLE "Order" ADD COLUMN "verifyToken" TEXT;
CREATE UNIQUE INDEX "Order_clientToken_key" ON "Order"("clientToken");

-- ReturnRequest: refund workflow
ALTER TABLE "ReturnRequest" ADD COLUMN "refundAmount" REAL;
ALTER TABLE "ReturnRequest" ADD COLUMN "refundMethod" TEXT;
ALTER TABLE "ReturnRequest" ADD COLUMN "stripeRefundId" TEXT;
ALTER TABLE "ReturnRequest" ADD COLUMN "receivedAt" DATETIME;
ALTER TABLE "ReturnRequest" ADD COLUMN "refundedAt" DATETIME;

-- Business: tax, COD verification, fraud, seller notify, courier
ALTER TABLE "Business" ADD COLUMN "taxInclusive" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Business" ADD COLUMN "taxLabel" TEXT DEFAULT 'Tax';
ALTER TABLE "Business" ADD COLUMN "codVerification" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Business" ADD COLUMN "notifyNewOrders" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Business" ADD COLUMN "fraudBlocklist" TEXT;
ALTER TABLE "Business" ADD COLUMN "courierProvider" TEXT;
ALTER TABLE "Business" ADD COLUMN "courierApiKey" TEXT;

-- Coupon: targeting rules
ALTER TABLE "Coupon" ADD COLUMN "perCustomerLimit" INTEGER;
ALTER TABLE "Coupon" ADD COLUMN "firstOrderOnly" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Coupon" ADD COLUMN "freeShipping" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Coupon" ADD COLUMN "autoApply" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Coupon" ADD COLUMN "minSubtotal" REAL;
ALTER TABLE "Coupon" ADD COLUMN "productIds" TEXT;

-- CustomerAddress
CREATE TABLE "CustomerAddress" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "businessId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "label" TEXT,
  "name" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "line1" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "area" TEXT,
  "postalCode" TEXT,
  "province" TEXT,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerAddress_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "StoreCustomer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "CustomerAddress_customerId_idx" ON "CustomerAddress"("customerId");

-- StockNotification
CREATE TABLE "StockNotification" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "businessId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "variantId" TEXT,
  "email" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notifiedAt" DATETIME,
  CONSTRAINT "StockNotification_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "StockNotification_businessId_productId_notifiedAt_idx" ON "StockNotification"("businessId", "productId", "notifiedAt");

-- RateLimit
CREATE TABLE "RateLimit" (
  "key" TEXT NOT NULL PRIMARY KEY,
  "count" INTEGER NOT NULL DEFAULT 0,
  "windowStart" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
