-- CreateTable
CREATE TABLE "StrategyChatMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "speaker" TEXT,
    "content" TEXT NOT NULL,
    "pendingOps" TEXT,
    "opsState" TEXT,
    "appliedSummary" TEXT,
    "askApproval" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StrategyChatMessage_planId_fkey" FOREIGN KEY ("planId") REFERENCES "GrowthPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "StrategyChatMessage_planId_createdAt_idx" ON "StrategyChatMessage"("planId", "createdAt");
