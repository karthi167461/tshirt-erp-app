import {
  ErrorCode,
  type CuttingPriceInput,
  type PouchPriceInput,
  type StretchingSlabsInput,
} from "@erp/shared";
import { prisma } from "../db.js";
import { ApiException } from "../errors.js";

/* ---------------- Cutting price by (category, size) ---------------- */

export function listCuttingPrices() {
  return prisma.cuttingPrice.findMany({
    include: { category: { select: { id: true, name: true } }, size: { select: { id: true, name: true } } },
  });
}

export function setCuttingPrice(input: CuttingPriceInput) {
  return prisma.cuttingPrice.upsert({
    where: { categoryId_sizeId: { categoryId: input.categoryId, sizeId: input.sizeId } },
    create: input,
    update: { pricePerDozen: input.pricePerDozen },
  });
}

/* ---------------- Pouch price by category ---------------- */

export function listPouchPrices() {
  return prisma.pouchPrice.findMany({
    include: { category: { select: { id: true, name: true } } },
  });
}

export function setPouchPrice(input: PouchPriceInput) {
  return prisma.pouchPrice.upsert({
    where: { categoryId: input.categoryId },
    create: input,
    update: { pricePerDozen: input.pricePerDozen },
  });
}

/* ---------------- Stretching size-range slabs by type ---------------- */

/** Replace-all: the given slabs become the type's full slab list (overlap already zod-checked). */
export async function setStretchingSlabs(stretchingTypeId: number, input: StretchingSlabsInput) {
  const type = await prisma.stretchingType.findUnique({ where: { id: stretchingTypeId } });
  if (!type) throw new ApiException(ErrorCode.STRETCHING_TYPE_NOT_FOUND, 404);
  await prisma.$transaction([
    prisma.stretchingPriceSlab.deleteMany({ where: { stretchingTypeId } }),
    prisma.stretchingPriceSlab.createMany({
      data: input.slabs.map((s) => ({ stretchingTypeId, ...s })),
    }),
  ]);
  return prisma.stretchingPriceSlab.findMany({ where: { stretchingTypeId }, orderBy: { minSize: "asc" } });
}

/* ---------------- Rate lookups (missing = 0, never NaN) ---------------- */

/**
 * Slab-aware stretching rate resolver. A lot's size name is parsed as a number
 * and matched against the type's slabs (inclusive bounds); non-numeric sizes or
 * no match fall back to the type's amountPerDozen ("without size" rate).
 */
export async function stretchingRateResolver(): Promise<{
  resolve: (stretchingTypeId: number, sizeName: string, fallback: number) => number;
  hasSlabs: (stretchingTypeId: number) => boolean;
}> {
  const rows = await prisma.stretchingPriceSlab.findMany();
  const byType = new Map<number, typeof rows>();
  for (const r of rows) {
    const list = byType.get(r.stretchingTypeId);
    if (list) list.push(r);
    else byType.set(r.stretchingTypeId, [r]);
  }
  return {
    hasSlabs: (stretchingTypeId) => byType.has(stretchingTypeId),
    resolve: (stretchingTypeId, sizeName, fallback) => {
      const n = Number(sizeName.trim());
      if (!Number.isFinite(n) || sizeName.trim() === "") return fallback;
      const hit = byType.get(stretchingTypeId)?.find((s) => n >= s.minSize && n <= s.maxSize);
      return hit ? hit.pricePerDozen : fallback;
    },
  };
}

/* ---------------- Flat rate lookups ---------------- */

/** Map keyed "categoryId:sizeId" → pricePerDozen for cutting. */
export async function cuttingRateMap(): Promise<Map<string, number>> {
  const rows = await prisma.cuttingPrice.findMany();
  return new Map(rows.map((r) => [`${r.categoryId}:${r.sizeId}`, r.pricePerDozen]));
}

/** Map keyed categoryId → pricePerDozen for pouch. */
export async function pouchRateMap(): Promise<Map<number, number>> {
  const rows = await prisma.pouchPrice.findMany();
  return new Map(rows.map((r) => [r.categoryId, r.pricePerDozen]));
}
