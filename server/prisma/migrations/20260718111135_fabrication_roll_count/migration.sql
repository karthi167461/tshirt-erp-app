/*
  Warnings:

  - You are about to drop the column `rollNumber` on the `FabricationRoll` table. All the data in the column will be lost.
  - You are about to drop the column `rollWeight` on the `FabricationRoll` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `FabricationRoll` table. All the data in the column will be lost.
  - Added the required column `rollCount` to the `FabricationRoll` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_FabricationRoll" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "fabricationLotId" INTEGER NOT NULL,
    "dia" TEXT NOT NULL,
    "rollCount" INTEGER NOT NULL,
    "weight" REAL NOT NULL,
    "texturePinnal" TEXT NOT NULL,
    "fabricationWeight" REAL,
    "dyeingWeight" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FabricationRoll_fabricationLotId_fkey" FOREIGN KEY ("fabricationLotId") REFERENCES "FabricationLot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_FabricationRoll" ("createdAt", "dia", "dyeingWeight", "fabricationLotId", "fabricationWeight", "id", "texturePinnal", "weight") SELECT "createdAt", "dia", "dyeingWeight", "fabricationLotId", "fabricationWeight", "id", "texturePinnal", "weight" FROM "FabricationRoll";
DROP TABLE "FabricationRoll";
ALTER TABLE "new_FabricationRoll" RENAME TO "FabricationRoll";
CREATE INDEX "FabricationRoll_fabricationLotId_idx" ON "FabricationRoll"("fabricationLotId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
