CREATE TABLE "SourceCache" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "etag" TEXT,
    "lastModified" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceCache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SourceCache_sourceId_key" ON "SourceCache"("sourceId");

ALTER TABLE "SourceCache" ADD CONSTRAINT "SourceCache_sourceId_fkey"
FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "FeedDownload" (
    "id" TEXT NOT NULL,
    "feedKey" TEXT NOT NULL,
    "downloads" INTEGER NOT NULL DEFAULT 0,
    "lastDownloaded" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedDownload_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FeedDownload_feedKey_key" ON "FeedDownload"("feedKey");
