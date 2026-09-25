-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_OrchestratorMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "speaker" TEXT,
    "needsUser" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrchestratorMessage_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_OrchestratorMessage" ("businessId", "content", "createdAt", "id", "role") SELECT "businessId", "content", "createdAt", "id", "role" FROM "OrchestratorMessage";
DROP TABLE "OrchestratorMessage";
ALTER TABLE "new_OrchestratorMessage" RENAME TO "OrchestratorMessage";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
