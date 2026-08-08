-- CreateTable
CREATE TABLE "RipCuttingEntry" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "fabricationLotId" INTEGER NOT NULL,
    "weight" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RipCuttingEntry_fabricationLotId_fkey" FOREIGN KEY ("fabricationLotId") REFERENCES "FabricationLot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_FabricationLot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "lotNumber" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'own',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_FabricationLot" ("createdAt", "id", "locked", "lotNumber", "status") SELECT "createdAt", "id", "locked", "lotNumber", "status" FROM "FabricationLot";
DROP TABLE "FabricationLot";
ALTER TABLE "new_FabricationLot" RENAME TO "FabricationLot";
CREATE UNIQUE INDEX "FabricationLot_lotNumber_key" ON "FabricationLot"("lotNumber");
CREATE INDEX "FabricationLot_status_idx" ON "FabricationLot"("status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "RipCuttingEntry_fabricationLotId_idx" ON "RipCuttingEntry"("fabricationLotId");
