CREATE INDEX "Channel_country_displayName_idx" ON "Channel"("country", "displayName");
CREATE INDEX "Channel_category_idx" ON "Channel"("category");
CREATE INDEX "Channel_normalized_idx" ON "Channel"("normalized");

CREATE INDEX "ImportRun_sourceId_startedAt_idx" ON "ImportRun"("sourceId", "startedAt");
CREATE INDEX "ImportRun_status_startedAt_idx" ON "ImportRun"("status", "startedAt");

CREATE INDEX "Mapping_providerId_idx" ON "Mapping"("providerId");
CREATE INDEX "Mapping_channelId_idx" ON "Mapping"("channelId");

CREATE INDEX "ExportProfile_country_idx" ON "ExportProfile"("country");
CREATE INDEX "ExportProfile_category_idx" ON "ExportProfile"("category");
CREATE INDEX "ExportProfile_providerId_idx" ON "ExportProfile"("providerId");

CREATE INDEX "ExportToken_active_idx" ON "ExportToken"("active");
CREATE INDEX "ExportToken_profileId_idx" ON "ExportToken"("profileId");
CREATE INDEX "ExportToken_providerId_idx" ON "ExportToken"("providerId");
CREATE INDEX "ExportToken_createdAt_idx" ON "ExportToken"("createdAt");
