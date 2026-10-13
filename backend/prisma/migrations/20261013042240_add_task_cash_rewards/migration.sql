-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TaskRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "challengeId" TEXT,
    "kind" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL DEFAULT 'medium',
    "correct" BOOLEAN NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "rewardCents" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_TaskRecord" ("correct", "createdAt", "durationMs", "id", "kind", "points", "userId") SELECT "correct", "createdAt", "durationMs", "id", "kind", "points", "userId" FROM "TaskRecord";
DROP TABLE "TaskRecord";
ALTER TABLE "new_TaskRecord" RENAME TO "TaskRecord";
CREATE UNIQUE INDEX "TaskRecord_challengeId_key" ON "TaskRecord"("challengeId");
CREATE INDEX "TaskRecord_userId_createdAt_idx" ON "TaskRecord"("userId", "createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
