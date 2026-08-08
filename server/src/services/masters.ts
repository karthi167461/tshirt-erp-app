import {
  ErrorCode,
  type CategoryInput,
  type SizeInput,
  type ColorInput,
} from "@erp/shared";
import { prisma } from "../db.js";
import { ApiException } from "../errors.js";

/** Prisma P2002 (unique constraint) → a translatable duplicate error. */
function rethrowDuplicate(e: unknown): never {
  if (e && typeof e === "object" && (e as any).code === "P2002") {
    throw new ApiException(ErrorCode.DUPLICATE, 400);
  }
  throw e;
}

/* ---------------- Categories ---------------- */

export function listCategories(activeOnly = false) {
  return prisma.category.findMany({
    where: activeOnly ? { active: true } : undefined,
    orderBy: { name: "asc" },
    include: { sizes: { orderBy: { id: "asc" } } },
  });
}

export async function createCategory(input: CategoryInput) {
  try {
    return await prisma.category.create({ data: input });
  } catch (e) {
    rethrowDuplicate(e);
  }
}

export function updateCategory(id: number, data: Partial<CategoryInput>) {
  return prisma.category.update({ where: { id }, data });
}

/** Delete a category only if no cutting lot uses it; cascades its sizes + prices. */
export async function deleteCategory(id: number) {
  const used = await prisma.cuttingLot.count({ where: { categoryId: id } });
  if (used > 0) throw new ApiException(ErrorCode.IN_USE, 400);
  await prisma.$transaction([
    prisma.cuttingPrice.deleteMany({ where: { categoryId: id } }),
    prisma.pouchPrice.deleteMany({ where: { categoryId: id } }),
    // Dia links are advisory hints, not records of work — drop them with the
    // category rather than blocking the delete (and before the sizes, whose
    // rows they also reference).
    prisma.diaSizeLink.deleteMany({ where: { categoryId: id } }),
    prisma.size.deleteMany({ where: { categoryId: id } }),
    prisma.category.delete({ where: { id } }),
  ]);
  return { deleted: true };
}

/* ---------------- Sizes ---------------- */

export function listSizes(categoryId?: number, activeOnly = false) {
  return prisma.size.findMany({
    where: {
      ...(categoryId ? { categoryId } : {}),
      ...(activeOnly ? { active: true } : {}),
    },
    orderBy: { id: "asc" },
  });
}

export async function createSize(input: SizeInput) {
  const category = await prisma.category.findUnique({
    where: { id: input.categoryId },
  });
  if (!category) throw new ApiException(ErrorCode.CATEGORY_NOT_FOUND, 404);
  try {
    return await prisma.size.create({ data: input });
  } catch (e) {
    rethrowDuplicate(e);
  }
}

export function updateSize(id: number, data: Partial<SizeInput>) {
  return prisma.size.update({ where: { id }, data });
}

/** Delete a size only if no cutting lot uses it; cascades its cutting prices. */
export async function deleteSize(id: number) {
  const used = await prisma.cuttingLot.count({ where: { sizeId: id } });
  if (used > 0) throw new ApiException(ErrorCode.IN_USE, 400);
  await prisma.$transaction([
    prisma.cuttingPrice.deleteMany({ where: { sizeId: id } }),
    prisma.diaSizeLink.deleteMany({ where: { sizeId: id } }),
    prisma.size.delete({ where: { id } }),
  ]);
  return { deleted: true };
}

/* ---------------- Colors ---------------- */

export function listColors(activeOnly = false) {
  return prisma.color.findMany({
    where: activeOnly ? { active: true } : undefined,
    orderBy: { name: "asc" },
  });
}

export async function createColor(input: ColorInput) {
  try {
    return await prisma.color.create({ data: input });
  } catch (e) {
    rethrowDuplicate(e);
  }
}

export function updateColor(id: number, data: Partial<ColorInput>) {
  return prisma.color.update({ where: { id }, data });
}

/** Delete a color only if no cutting entry uses its name (colors are string-keyed). */
export async function deleteColor(id: number) {
  const color = await prisma.color.findUnique({ where: { id } });
  if (!color) throw new ApiException(ErrorCode.VALIDATION, 404);
  const used = await prisma.cuttingEntry.count({ where: { color: color.name } });
  if (used > 0) throw new ApiException(ErrorCode.IN_USE, 400);
  await prisma.color.delete({ where: { id } });
  return { deleted: true };
}

/** Delete a stretching type only if no stretching entry references it. */
export async function deleteStretchingType(id: number) {
  const used = await prisma.stretchingEntry.count({ where: { stretchingTypeId: id } });
  if (used > 0) throw new ApiException(ErrorCode.IN_USE, 400);
  await prisma.stretchingType.delete({ where: { id } });
  return { deleted: true };
}
