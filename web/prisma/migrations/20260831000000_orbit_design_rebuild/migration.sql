-- Rebuild StoreDesign: collapse the old per-field storefront model into a single JSON `doc`
-- (OrbitDesignDoc: tokens + ordered sections). Safe in dev; old design data is intentionally dropped.
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_StoreDesign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "doc" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StoreDesign_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_StoreDesign" ("id", "businessId", "published", "updatedAt")
SELECT "id", "businessId", "published", "updatedAt" FROM "StoreDesign";
DROP TABLE "StoreDesign";
ALTER TABLE "new_StoreDesign" RENAME TO "StoreDesign";
CREATE UNIQUE INDEX "StoreDesign_businessId_key" ON "StoreDesign"("businessId");
PRAGMA foreign_keys=ON;
