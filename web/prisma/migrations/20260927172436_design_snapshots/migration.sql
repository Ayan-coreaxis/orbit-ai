-- CreateTable
CREATE TABLE "DesignSnapshot" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "doc" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DesignSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DesignSnapshot_businessId_createdAt_idx" ON "DesignSnapshot"("businessId", "createdAt");

-- AddForeignKey
ALTER TABLE "DesignSnapshot" ADD CONSTRAINT "DesignSnapshot_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
