-- CreateTable
CREATE TABLE "StoreDesign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "themeId" TEXT NOT NULL DEFAULT 'minimal',
    "sections" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StoreDesign_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "StoreDesign_businessId_key" ON "StoreDesign"("businessId");
