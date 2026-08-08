-- CreateTable
CREATE TABLE "DiaSizeLink" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "dia" TEXT NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "sizeId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DiaSizeLink_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DiaSizeLink_sizeId_fkey" FOREIGN KEY ("sizeId") REFERENCES "Size" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "DiaSizeLink_dia_idx" ON "DiaSizeLink"("dia");

-- CreateIndex
CREATE INDEX "DiaSizeLink_categoryId_idx" ON "DiaSizeLink"("categoryId");

-- CreateIndex
CREATE INDEX "DiaSizeLink_sizeId_idx" ON "DiaSizeLink"("sizeId");

-- CreateIndex
CREATE UNIQUE INDEX "DiaSizeLink_dia_categoryId_sizeId_key" ON "DiaSizeLink"("dia", "categoryId", "sizeId");
