-- AlterTable
ALTER TABLE "Strategy" ADD COLUMN "executedAt" DATETIME;

-- CreateTable
CREATE TABLE "StrategyAction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "strategyId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "input" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "output" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StrategyAction_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "StrategyAction_strategyId_idx" ON "StrategyAction"("strategyId");
