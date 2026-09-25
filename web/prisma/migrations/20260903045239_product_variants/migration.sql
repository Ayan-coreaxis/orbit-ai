-- Product: option-axis definition for variants
ALTER TABLE "Product" ADD COLUMN "optionTypes" TEXT;

-- ProductVariant: reshape to combination-SKU model (table was unused)
DROP TABLE IF EXISTS "ProductVariant";
CREATE TABLE "ProductVariant" (
  "id"        TEXT NOT NULL PRIMARY KEY,
  "productId" TEXT NOT NULL,
  "label"     TEXT NOT NULL,
  "options"   TEXT NOT NULL,
  "sku"       TEXT,
  "price"     REAL,
  "stock"     INTEGER NOT NULL DEFAULT 0,
  "imageUrl"  TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ProductVariant_productId_idx" ON "ProductVariant"("productId");
