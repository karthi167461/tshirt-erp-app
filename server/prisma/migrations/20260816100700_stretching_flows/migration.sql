-- CreateTable
CREATE TABLE "StretchingFlow" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "skipKainool" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "StretchingFlowStep" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "flowId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "stretchingTypeId" INTEGER NOT NULL,
    CONSTRAINT "StretchingFlowStep_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "StretchingFlow" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StretchingFlowStep_stretchingTypeId_fkey" FOREIGN KEY ("stretchingTypeId") REFERENCES "StretchingType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CuttingLot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "cuttingLotNumber" TEXT NOT NULL,
    "fabricationLotId" INTEGER NOT NULL,
    "dia" TEXT NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "sizeId" INTEGER NOT NULL,
    "stretchingFlowId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CuttingLot_fabricationLotId_fkey" FOREIGN KEY ("fabricationLotId") REFERENCES "FabricationLot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CuttingLot_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CuttingLot_sizeId_fkey" FOREIGN KEY ("sizeId") REFERENCES "Size" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CuttingLot_stretchingFlowId_fkey" FOREIGN KEY ("stretchingFlowId") REFERENCES "StretchingFlow" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_CuttingLot" ("categoryId", "createdAt", "cuttingLotNumber", "dia", "fabricationLotId", "id", "sizeId", "status") SELECT "categoryId", "createdAt", "cuttingLotNumber", "dia", "fabricationLotId", "id", "sizeId", "status" FROM "CuttingLot";
DROP TABLE "CuttingLot";
ALTER TABLE "new_CuttingLot" RENAME TO "CuttingLot";
CREATE INDEX "CuttingLot_fabricationLotId_idx" ON "CuttingLot"("fabricationLotId");
CREATE INDEX "CuttingLot_status_idx" ON "CuttingLot"("status");
CREATE INDEX "CuttingLot_stretchingFlowId_idx" ON "CuttingLot"("stretchingFlowId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "StretchingFlow_name_key" ON "StretchingFlow"("name");

-- CreateIndex
CREATE INDEX "StretchingFlowStep_stretchingTypeId_idx" ON "StretchingFlowStep"("stretchingTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "StretchingFlowStep_flowId_position_key" ON "StretchingFlowStep"("flowId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "StretchingFlowStep_flowId_stretchingTypeId_key" ON "StretchingFlowStep"("flowId", "stretchingTypeId");
