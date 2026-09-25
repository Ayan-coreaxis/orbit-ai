-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_StoreDesign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "themeId" TEXT NOT NULL DEFAULT 'minimal',
    "sections" TEXT NOT NULL,
    "logoUrl" TEXT,
    "bannerText" TEXT,
    "heroImageUrl" TEXT,
    "promoText" TEXT,
    "socialLinks" TEXT,
    "footerText" TEXT,
    "chatWidgetStyle" TEXT NOT NULL DEFAULT 'minimal',
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StoreDesign_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_StoreDesign" ("bannerText", "businessId", "heroImageUrl", "id", "logoUrl", "promoText", "sections", "socialLinks", "themeId", "updatedAt") SELECT "bannerText", "businessId", "heroImageUrl", "id", "logoUrl", "promoText", "sections", "socialLinks", "themeId", "updatedAt" FROM "StoreDesign";
DROP TABLE "StoreDesign";
ALTER TABLE "new_StoreDesign" RENAME TO "StoreDesign";
CREATE UNIQUE INDEX "StoreDesign_businessId_key" ON "StoreDesign"("businessId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
