-- CreateTable
CREATE TABLE "SourceCache" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "etag" TEXT,
    "lastModified" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedDownload" (
    "id" TEXT NOT NULL,
    "feedKey" TEXT NOT NULL,
    "downloads" INTEGER NOT NULL DEFAULT 0,
    "lastDownloaded" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedDownload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SourceCache_sourceId_key" ON "SourceCache"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "FeedDownload_feedKey_key" ON "FeedDownload"("feedKey");

-- CreateIndex
CREATE INDEX "Program_channelId_idx" ON "Program"("channelId");

-- CreateIndex
CREATE INDEX "Program_checksum_idx" ON "Program"("checksum");

-- CreateIndex
CREATE INDEX "Program_sourceId_idx" ON "Program"("sourceId");

-- AddForeignKey
ALTER TABLE "SourceCache" ADD CONSTRAINT "SourceCache_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceHealth" ADD CONSTRAINT "SourceHealth_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
