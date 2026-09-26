-- CreateTable
CREATE TABLE "StudioJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "input" TEXT NOT NULL,
    "brief" TEXT,
    "stage" TEXT,
    "providerTaskId" TEXT,
    "keyframeMediaId" TEXT,
    "resultMediaId" TEXT,
    "error" TEXT,
    "costUsd" REAL NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'content',
    "startedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StudioJob_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "StudioJob_businessId_createdAt_idx" ON "StudioJob"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "StudioJob_businessId_status_idx" ON "StudioJob"("businessId", "status");

