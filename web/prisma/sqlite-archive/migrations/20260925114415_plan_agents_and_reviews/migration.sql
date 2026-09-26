-- CreateTable
CREATE TABLE "PlanAgent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "tools" TEXT NOT NULL,
    "dataScopes" TEXT NOT NULL,
    "budgetUsd" REAL NOT NULL,
    "spentUsd" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "retiredAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlanAgent_planId_fkey" FOREIGN KEY ("planId") REFERENCES "GrowthPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Strategy" (
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
    "executedAt" DATETIME,
    "lastReviewedAt" DATETIME,
    "agentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Strategy_planId_fkey" FOREIGN KEY ("planId") REFERENCES "GrowthPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Strategy_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "PlanAgent" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Strategy" ("audience", "businessId", "costNote", "createdAt", "discountPct", "durationDays", "endedAt", "executedAt", "id", "kind", "metric", "planId", "position", "profitNote", "startedAt", "status", "steps", "title", "updatedAt", "why") SELECT "audience", "businessId", "costNote", "createdAt", "discountPct", "durationDays", "endedAt", "executedAt", "id", "kind", "metric", "planId", "position", "profitNote", "startedAt", "status", "steps", "title", "updatedAt", "why" FROM "Strategy";
DROP TABLE "Strategy";
ALTER TABLE "new_Strategy" RENAME TO "Strategy";
CREATE INDEX "Strategy_businessId_status_idx" ON "Strategy"("businessId", "status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "PlanAgent_businessId_status_idx" ON "PlanAgent"("businessId", "status");
