-- Agent-built stores: the site's own files (draft + live), the running build, and its versions.
ALTER TABLE "StoreDesign" ADD COLUMN "site" TEXT;
ALTER TABLE "StoreDesign" ADD COLUMN "siteLive" TEXT;
ALTER TABLE "StoreDesign" ADD COLUMN "siteBuild" TEXT;

CREATE TABLE "StoreSiteVersion" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "site" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoreSiteVersion_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "StoreSiteVersion_businessId_createdAt_idx" ON "StoreSiteVersion"("businessId", "createdAt");
ALTER TABLE "StoreSiteVersion" ADD CONSTRAINT "StoreSiteVersion_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
