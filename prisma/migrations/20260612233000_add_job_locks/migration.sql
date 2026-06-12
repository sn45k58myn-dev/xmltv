CREATE TABLE "JobLock" (
    "name" TEXT NOT NULL,
    "owner" TEXT,
    "lockedUntil" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobLock_pkey" PRIMARY KEY ("name")
);

CREATE INDEX "JobLock_lockedUntil_idx" ON "JobLock"("lockedUntil");
