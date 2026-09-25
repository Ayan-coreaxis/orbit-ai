-- CreateTable
CREATE TABLE "GrowthPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "diagnosis" TEXT NOT NULL,
    "snapshot" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "approvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GrowthPlan_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Strategy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "why" TEXT NOT NULL,
    "steps" TEXT NOT NULL,
    "durationDays" INTEGER,
    "metric" TEXT NOT NULL,
    "costNote" TEXT,
    "discountPct" REAL,
    "profitNote" TEXT,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "startedAt" DATETIME,
    "endedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Strategy_planId_fkey" FOREIGN KEY ("planId") REFERENCES "GrowthPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "GrowthPlan_businessId_status_idx" ON "GrowthPlan"("businessId", "status");

-- CreateIndex
CREATE INDEX "Strategy_businessId_status_idx" ON "Strategy"("businessId", "status");
