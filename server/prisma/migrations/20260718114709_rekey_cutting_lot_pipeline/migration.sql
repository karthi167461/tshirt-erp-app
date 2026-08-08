/*
  Warnings:

  - You are about to drop the `Lot` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `QcEntry` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `lotId` on the `CuttingEntry` table. All the data in the column will be lost.
  - You are about to drop the column `lotId` on the `PackingEntry` table. All the data in the column will be lost.
  - You are about to drop the column `lotId` on the `StretchingEntry` table. All the data in the column will be lost.
  - Added the required column `cuttingLotId` to the `CuttingEntry` table without a default value. This is not possible if the table is not empty.
  - Added the required column `cuttingLotId` to the `PackingEntry` table without a default value. This is not possible if the table is not empty.
  - Added the required column `cuttingLotId` to the `StretchingEntry` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Lot_lotNumber_key";

-- DropIndex
DROP INDEX "QcEntry_date_idx";

-- DropIndex
DROP INDEX "QcEntry_lotId_color_idx";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Lot";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "QcEntry";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "PouchEntry" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "cuttingLotId" INTEGER NOT NULL,
    "color" TEXT NOT NULL,
    "dozen" REAL NOT NULL,
    "pieces" INTEGER,
    "employeeId" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PouchEntry_cuttingLotId_fkey" FOREIGN KEY ("cuttingLotId") REFERENCES "CuttingLot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PouchEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PichiruEntry" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "cuttingLotId" INTEGER NOT NULL,
    "color" TEXT NOT NULL,
    "dozen" REAL NOT NULL,
    "pieces" INTEGER,
    "employeeId" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PichiruEntry_cuttingLotId_fkey" FOREIGN KEY ("cuttingLotId") REFERENCES "CuttingLot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PichiruEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CuttingEntry" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "cuttingLotId" INTEGER NOT NULL,
    "color" TEXT NOT NULL,
    "dozen" REAL NOT NULL,
    "pieces" INTEGER,
    "employeeId" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CuttingEntry_cuttingLotId_fkey" FOREIGN KEY ("cuttingLotId") REFERENCES "CuttingLot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CuttingEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_CuttingEntry" ("color", "createdAt", "date", "dozen", "employeeId", "id") SELECT "color", "createdAt", "date", "dozen", "employeeId", "id" FROM "CuttingEntry";
DROP TABLE "CuttingEntry";
ALTER TABLE "new_CuttingEntry" RENAME TO "CuttingEntry";
CREATE INDEX "CuttingEntry_cuttingLotId_color_idx" ON "CuttingEntry"("cuttingLotId", "color");
CREATE INDEX "CuttingEntry_date_idx" ON "CuttingEntry"("date");
CREATE TABLE "new_PackingEntry" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "cuttingLotId" INTEGER NOT NULL,
    "color" TEXT NOT NULL,
    "dozen" REAL NOT NULL,
    "pieces" INTEGER,
    "employeeId" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PackingEntry_cuttingLotId_fkey" FOREIGN KEY ("cuttingLotId") REFERENCES "CuttingLot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PackingEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_PackingEntry" ("color", "createdAt", "date", "dozen", "employeeId", "id") SELECT "color", "createdAt", "date", "dozen", "employeeId", "id" FROM "PackingEntry";
DROP TABLE "PackingEntry";
ALTER TABLE "new_PackingEntry" RENAME TO "PackingEntry";
CREATE INDEX "PackingEntry_cuttingLotId_color_idx" ON "PackingEntry"("cuttingLotId", "color");
CREATE INDEX "PackingEntry_date_idx" ON "PackingEntry"("date");
CREATE TABLE "new_StretchingEntry" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "cuttingLotId" INTEGER NOT NULL,
    "color" TEXT NOT NULL,
    "stretchingTypeId" INTEGER NOT NULL,
    "dozen" REAL NOT NULL,
    "pieces" INTEGER,
    "employeeId" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StretchingEntry_cuttingLotId_fkey" FOREIGN KEY ("cuttingLotId") REFERENCES "CuttingLot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StretchingEntry_stretchingTypeId_fkey" FOREIGN KEY ("stretchingTypeId") REFERENCES "StretchingType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StretchingEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_StretchingEntry" ("color", "createdAt", "date", "dozen", "employeeId", "id", "stretchingTypeId") SELECT "color", "createdAt", "date", "dozen", "employeeId", "id", "stretchingTypeId" FROM "StretchingEntry";
DROP TABLE "StretchingEntry";
ALTER TABLE "new_StretchingEntry" RENAME TO "StretchingEntry";
CREATE INDEX "StretchingEntry_cuttingLotId_color_stretchingTypeId_idx" ON "StretchingEntry"("cuttingLotId", "color", "stretchingTypeId");
CREATE INDEX "StretchingEntry_date_idx" ON "StretchingEntry"("date");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "PouchEntry_cuttingLotId_color_idx" ON "PouchEntry"("cuttingLotId", "color");

-- CreateIndex
CREATE INDEX "PouchEntry_date_idx" ON "PouchEntry"("date");

-- CreateIndex
CREATE INDEX "PichiruEntry_cuttingLotId_color_idx" ON "PichiruEntry"("cuttingLotId", "color");

-- CreateIndex
CREATE INDEX "PichiruEntry_date_idx" ON "PichiruEntry"("date");
