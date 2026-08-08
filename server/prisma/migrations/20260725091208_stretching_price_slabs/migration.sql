-- CreateTable
CREATE TABLE "StretchingPriceSlab" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "stretchingTypeId" INTEGER NOT NULL,
    "minSize" REAL NOT NULL,
    "maxSize" REAL NOT NULL,
    "pricePerDozen" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "StretchingPriceSlab_stretchingTypeId_fkey" FOREIGN KEY ("stretchingTypeId") REFERENCES "StretchingType" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "StretchingPriceSlab_stretchingTypeId_idx" ON "StretchingPriceSlab"("stretchingTypeId");
