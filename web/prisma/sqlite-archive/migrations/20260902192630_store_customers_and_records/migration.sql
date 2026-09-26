-- AlterTable
ALTER TABLE "StoreDesign" ADD COLUMN "backend" TEXT;
ALTER TABLE "StoreDesign" ADD COLUMN "backendWiredAt" DATETIME;

-- CreateTable
CREATE TABLE "StoreCustomer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "passwordHash" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoreCustomer_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CustomerOtp" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "consumedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerOtp_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StoreRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "collection" TEXT NOT NULL,
    "customerId" TEXT,
    "productId" TEXT,
    "data" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'published',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoreRecord_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StoreRecord_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "StoreCustomer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "customerId" TEXT,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "items" TEXT NOT NULL,
    "total" REAL NOT NULL,
    "couponCode" TEXT,
    "discountAmount" REAL NOT NULL DEFAULT 0,
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
    "trackingNotifiedAt" DATETIME,
    "trackingNotifyError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Order_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "StoreCustomer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Order" ("address", "businessId", "confirmationNotifiedAt", "confirmationNotifyError", "confirmedAt", "couponCode", "courierName", "createdAt", "customerName", "customerPhone", "discountAmount", "flagReason", "flagged", "id", "items", "paymentProvider", "paymentStatus", "shippedAt", "status", "stripeSessionId", "total", "trackingNotifiedAt", "trackingNotifyError", "trackingNumber", "trackingUrl") SELECT "address", "businessId", "confirmationNotifiedAt", "confirmationNotifyError", "confirmedAt", "couponCode", "courierName", "createdAt", "customerName", "customerPhone", "discountAmount", "flagReason", "flagged", "id", "items", "paymentProvider", "paymentStatus", "shippedAt", "status", "stripeSessionId", "total", "trackingNotifiedAt", "trackingNotifyError", "trackingNumber", "trackingUrl" FROM "Order";
DROP TABLE "Order";
ALTER TABLE "new_Order" RENAME TO "Order";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "StoreCustomer_businessId_idx" ON "StoreCustomer"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "StoreCustomer_businessId_email_key" ON "StoreCustomer"("businessId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "StoreCustomer_businessId_phone_key" ON "StoreCustomer"("businessId", "phone");

-- CreateIndex
CREATE INDEX "CustomerOtp_businessId_target_idx" ON "CustomerOtp"("businessId", "target");

-- CreateIndex
CREATE INDEX "StoreRecord_businessId_collection_status_idx" ON "StoreRecord"("businessId", "collection", "status");

-- CreateIndex
CREATE INDEX "StoreRecord_businessId_collection_productId_idx" ON "StoreRecord"("businessId", "collection", "productId");
