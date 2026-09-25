-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_McpConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "connectorId" TEXT,
    "mcpServerUrl" TEXT NOT NULL,
    "authType" TEXT NOT NULL DEFAULT 'none',
    "authToken" TEXT,
    "skill" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastStatus" TEXT,
    "lastCheckedAt" DATETIME,
    "lastToolNames" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "oauthState" TEXT,
    "oauthCodeVerifier" TEXT,
    "oauthClientId" TEXT,
    "oauthClientSecret" TEXT,
    "oauthTokenUrl" TEXT,
    "oauthResource" TEXT,
    "oauthScope" TEXT,
    "oauthAccessToken" TEXT,
    "oauthRefreshToken" TEXT,
    "oauthExpiresAt" DATETIME,
    CONSTRAINT "McpConnection_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_McpConnection" ("authToken", "businessId", "connectorId", "createdAt", "enabled", "id", "lastCheckedAt", "lastStatus", "lastToolNames", "mcpServerUrl", "name", "skill") SELECT "authToken", "businessId", "connectorId", "createdAt", "enabled", "id", "lastCheckedAt", "lastStatus", "lastToolNames", "mcpServerUrl", "name", "skill" FROM "McpConnection";
DROP TABLE "McpConnection";
ALTER TABLE "new_McpConnection" RENAME TO "McpConnection";
CREATE UNIQUE INDEX "McpConnection_oauthState_key" ON "McpConnection"("oauthState");
CREATE INDEX "McpConnection_businessId_idx" ON "McpConnection"("businessId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
