-- CreateTable
CREATE TABLE "LinkedWallet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "accountIdentifier" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LinkedWallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "LinkedWallet_userId_createdAt_idx" ON "LinkedWallet"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LinkedWallet_userId_provider_key" ON "LinkedWallet"("userId", "provider");
