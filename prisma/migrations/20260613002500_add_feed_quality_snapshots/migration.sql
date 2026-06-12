CREATE TABLE "FeedQualitySnapshot" (
    "id" TEXT NOT NULL,
    "feedKey" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "grade" TEXT NOT NULL,
    "valid" BOOLEAN NOT NULL,
    "channels" INTEGER NOT NULL DEFAULT 0,
    "programs" INTEGER NOT NULL DEFAULT 0,
    "bytes" INTEGER NOT NULL DEFAULT 0,
    "reasons" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedQualitySnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FeedQualitySnapshot_feedKey_createdAt_idx" ON "FeedQualitySnapshot"("feedKey", "createdAt");
CREATE INDEX "FeedQualitySnapshot_grade_createdAt_idx" ON "FeedQualitySnapshot"("grade", "createdAt");
