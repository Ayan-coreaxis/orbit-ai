/*
  Warnings:

  - You are about to drop the `AgentToolConnection` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "AgentToolConnection";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "McpConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "connectorId" TEXT,
    "mcpServerUrl" TEXT NOT NULL,
    "authToken" TEXT,
    "skill" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastStatus" TEXT,
    "lastCheckedAt" DATETIME,
    "lastToolNames" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "McpConnection_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "McpConnection_businessId_idx" ON "McpConnection"("businessId");
