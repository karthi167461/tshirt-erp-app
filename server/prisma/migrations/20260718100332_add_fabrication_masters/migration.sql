-- CreateTable
CREATE TABLE "Category" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Size" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "categoryId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "Size_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Color" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "FabricationLot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "lotNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "FabricationRoll" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "fabricationLotId" INTEGER NOT NULL,
    "dia" TEXT NOT NULL,
    "rollNumber" TEXT NOT NULL,
    "weight" REAL NOT NULL,
    "texturePinnal" TEXT NOT NULL,
    "rollWeight" REAL,
    "type" TEXT,
    "fabricationWeight" REAL,
    "dyeingWeight" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FabricationRoll_fabricationLotId_fkey" FOREIGN KEY ("fabricationLotId") REFERENCES "FabricationLot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CuttingLot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "cuttingLotNumber" TEXT NOT NULL,
    "fabricationLotId" INTEGER NOT NULL,
    "dia" TEXT NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "sizeId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CuttingLot_fabricationLotId_fkey" FOREIGN KEY ("fabricationLotId") REFERENCES "FabricationLot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CuttingLot_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CuttingLot_sizeId_fkey" FOREIGN KEY ("sizeId") REFERENCES "Size" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CuttingPrice" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "categoryId" INTEGER NOT NULL,
    "sizeId" INTEGER NOT NULL,
    "pricePerDozen" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "CuttingPrice_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CuttingPrice_sizeId_fkey" FOREIGN KEY ("sizeId") REFERENCES "Size" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PouchPrice" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "categoryId" INTEGER NOT NULL,
    "pricePerDozen" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "PouchPrice_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WeeklySalary" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "employeeId" INTEGER NOT NULL,
    "weekStart" TEXT NOT NULL,
    "weekEnd" TEXT NOT NULL,
    "linesJson" TEXT NOT NULL,
    "grossTotal" REAL NOT NULL,
    "advanceDeducted" REAL NOT NULL DEFAULT 0,
    "netTotal" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WeeklySalary_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Employee" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "role" TEXT NOT NULL,
    "advance" REAL NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Employee" ("active", "createdAt", "id", "name", "role") SELECT "active", "createdAt", "id", "name", "role" FROM "Employee";
DROP TABLE "Employee";
ALTER TABLE "new_Employee" RENAME TO "Employee";
CREATE TABLE "new_Settings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "companyName" TEXT NOT NULL DEFAULT 'My Company',
    "themeColor" TEXT NOT NULL DEFAULT '#4f46e5',
    "cuttingPricePerDozen" REAL NOT NULL DEFAULT 0,
    "qcPricePerDozen" REAL NOT NULL DEFAULT 0,
    "packingPricePerDozen" REAL NOT NULL DEFAULT 0,
    "adminPin" TEXT NOT NULL DEFAULT '1234',
    "telegramBotToken" TEXT NOT NULL DEFAULT '',
    "telegramChatId" TEXT NOT NULL DEFAULT ''
);
INSERT INTO "new_Settings" ("adminPin", "companyName", "cuttingPricePerDozen", "id", "packingPricePerDozen", "qcPricePerDozen", "themeColor") SELECT "adminPin", "companyName", "cuttingPricePerDozen", "id", "packingPricePerDozen", "qcPricePerDozen", "themeColor" FROM "Settings";
DROP TABLE "Settings";
ALTER TABLE "new_Settings" RENAME TO "Settings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- CreateIndex
CREATE INDEX "Size_categoryId_idx" ON "Size"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "Size_categoryId_name_key" ON "Size"("categoryId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Color_name_key" ON "Color"("name");

-- CreateIndex
CREATE UNIQUE INDEX "FabricationLot_lotNumber_key" ON "FabricationLot"("lotNumber");

-- CreateIndex
CREATE INDEX "FabricationLot_status_idx" ON "FabricationLot"("status");

-- CreateIndex
CREATE INDEX "FabricationRoll_fabricationLotId_idx" ON "FabricationRoll"("fabricationLotId");

-- CreateIndex
CREATE UNIQUE INDEX "CuttingLot_cuttingLotNumber_key" ON "CuttingLot"("cuttingLotNumber");

-- CreateIndex
CREATE INDEX "CuttingLot_fabricationLotId_idx" ON "CuttingLot"("fabricationLotId");

-- CreateIndex
CREATE INDEX "CuttingLot_status_idx" ON "CuttingLot"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CuttingPrice_categoryId_sizeId_key" ON "CuttingPrice"("categoryId", "sizeId");

-- CreateIndex
CREATE UNIQUE INDEX "PouchPrice_categoryId_key" ON "PouchPrice"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklySalary_employeeId_weekStart_key" ON "WeeklySalary"("employeeId", "weekStart");
