CREATE TABLE "JobQueue" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "payload" TEXT,
    "result" TEXT,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedBy" TEXT,
    "lockedUntil" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobQueue_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "JobQueue_status_runAfter_createdAt_idx" ON "JobQueue"("status", "runAfter", "createdAt");
CREATE INDEX "JobQueue_type_status_idx" ON "JobQueue"("type", "status");
CREATE INDEX "JobQueue_lockedUntil_idx" ON "JobQueue"("lockedUntil");
