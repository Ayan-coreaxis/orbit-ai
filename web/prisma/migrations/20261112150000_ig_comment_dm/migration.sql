-- CreateTable
CREATE TABLE "CommentRule" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "keywords" TEXT NOT NULL,
    "postId" TEXT,
    "dmText" TEXT NOT NULL,
    "productId" TEXT,
    "publicReply" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommentRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommentDmLog" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "ruleId" TEXT,
    "commentId" TEXT NOT NULL,
    "commenterId" TEXT NOT NULL,
    "commenterName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommentDmLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommentRule_businessId_active_idx" ON "CommentRule"("businessId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "CommentDmLog_businessId_commentId_key" ON "CommentDmLog"("businessId", "commentId");

-- CreateIndex
CREATE INDEX "CommentDmLog_businessId_commenterId_createdAt_idx" ON "CommentDmLog"("businessId", "commenterId", "createdAt");

-- AddForeignKey
ALTER TABLE "CommentRule" ADD CONSTRAINT "CommentRule_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentRule" ADD CONSTRAINT "CommentRule_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentDmLog" ADD CONSTRAINT "CommentDmLog_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
