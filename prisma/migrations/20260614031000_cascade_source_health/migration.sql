ALTER TABLE "SourceHealth" DROP CONSTRAINT IF EXISTS "SourceHealth_sourceId_fkey";

ALTER TABLE "SourceHealth"
  ADD CONSTRAINT "SourceHealth_sourceId_fkey"
  FOREIGN KEY ("sourceId") REFERENCES "Source"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
