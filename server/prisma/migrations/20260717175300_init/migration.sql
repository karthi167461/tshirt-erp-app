-- CreateTable
CREATE TABLE "Employee" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Lot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "lotNumber" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "CuttingEntry" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "lotId" INTEGER NOT NULL,
    "color" TEXT NOT NULL,
    "dozen" REAL NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CuttingEntry_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CuttingEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StretchingType" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "amountPerDozen" REAL NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "StretchingEntry" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "lotId" INTEGER NOT NULL,
    "color" TEXT NOT NULL,
    "stretchingTypeId" INTEGER NOT NULL,
    "dozen" REAL NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StretchingEntry_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StretchingEntry_stretchingTypeId_fkey" FOREIGN KEY ("stretchingTypeId") REFERENCES "StretchingType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StretchingEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QcEntry" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "lotId" INTEGER NOT NULL,
    "color" TEXT NOT NULL,
    "dozen" REAL NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QcEntry_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QcEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PackingEntry" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "lotId" INTEGER NOT NULL,
    "color" TEXT NOT NULL,
    "dozen" REAL NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PackingEntry_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PackingEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "companyName" TEXT NOT NULL DEFAULT 'My Company',
    "themeColor" TEXT NOT NULL DEFAULT '#4f46e5',
    "cuttingPricePerDozen" REAL NOT NULL DEFAULT 0,
    "qcPricePerDozen" REAL NOT NULL DEFAULT 0,
    "packingPricePerDozen" REAL NOT NULL DEFAULT 0,
    "adminPin" TEXT NOT NULL DEFAULT '1234'
);

-- CreateIndex
CREATE UNIQUE INDEX "Lot_lotNumber_key" ON "Lot"("lotNumber");

-- CreateIndex
CREATE INDEX "CuttingEntry_lotId_color_idx" ON "CuttingEntry"("lotId", "color");

-- CreateIndex
CREATE INDEX "CuttingEntry_date_idx" ON "CuttingEntry"("date");

-- CreateIndex
CREATE INDEX "StretchingEntry_lotId_color_stretchingTypeId_idx" ON "StretchingEntry"("lotId", "color", "stretchingTypeId");

-- CreateIndex
CREATE INDEX "StretchingEntry_date_idx" ON "StretchingEntry"("date");

-- CreateIndex
CREATE INDEX "QcEntry_lotId_color_idx" ON "QcEntry"("lotId", "color");

-- CreateIndex
CREATE INDEX "QcEntry_date_idx" ON "QcEntry"("date");

-- CreateIndex
CREATE INDEX "PackingEntry_lotId_color_idx" ON "PackingEntry"("lotId", "color");

-- CreateIndex
CREATE INDEX "PackingEntry_date_idx" ON "PackingEntry"("date");
