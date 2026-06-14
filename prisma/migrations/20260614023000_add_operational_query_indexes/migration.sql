CREATE INDEX "SourceHealth_checkedAt_idx" ON "SourceHealth"("checkedAt");
CREATE INDEX "SourceHealth_sourceId_checkedAt_idx" ON "SourceHealth"("sourceId", "checkedAt");
CREATE INDEX "FeedDownload_downloads_idx" ON "FeedDownload"("downloads");
CREATE INDEX "FeedDownload_lastDownloaded_idx" ON "FeedDownload"("lastDownloaded");
