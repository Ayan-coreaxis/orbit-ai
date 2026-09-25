-- AlterTable
ALTER TABLE "McpConnection" ADD COLUMN "sourcePluginId" TEXT;

-- AlterTable
ALTER TABLE "Skill" ADD COLUMN "sourcePluginId" TEXT;

-- CreateTable
CREATE TABLE "PluginInstall" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "pluginId" TEXT NOT NULL,
    "installedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PluginInstall_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PluginInstall_businessId_pluginId_key" ON "PluginInstall"("businessId", "pluginId");
