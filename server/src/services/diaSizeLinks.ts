import { ErrorCode, type DiaSizeLinkInput } from "@erp/shared";
import { prisma } from "../db.js";
import { ApiException } from "../errors.js";

/**
 * Dia → (category, size) hints used to pre-fill the cutting-lot form.
 *
 * A dia may legitimately map to SEVERAL pairs — live data has dia "80" spanning
 * nine (category, size) combinations — so the caller auto-fills only when a dia
 * resolves to exactly one link, and otherwise narrows the pickers. Nothing here
 * touches CuttingLot.dia or FabricationRoll.dia.
 */

const includeRefs = {
  category: { select: { id: true, name: true } },
  size: { select: { id: true, name: true } },
} as const;

export function listDiaSizeLinks() {
  return prisma.diaSizeLink.findMany({
    include: includeRefs,
    orderBy: [{ dia: "asc" }, { categoryId: "asc" }, { sizeId: "asc" }],
  });
}

/** A size belongs to exactly one category; reject mismatched pairs the same way
 *  createCuttingLot does, so a link can never suggest an impossible combination. */
async function assertPair(categoryId: number, sizeId: number) {
  const category = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!category) throw new ApiException(ErrorCode.CATEGORY_NOT_FOUND, 404);
  const size = await prisma.size.findUnique({ where: { id: sizeId } });
  if (!size || size.categoryId !== categoryId)
    throw new ApiException(ErrorCode.SIZE_NOT_FOUND, 404);
}

function rethrowDuplicate(e: unknown): never {
  if ((e as { code?: string })?.code === "P2002")
    throw new ApiException(ErrorCode.DUPLICATE, 400);
  throw e;
}

export async function createDiaSizeLink(input: DiaSizeLinkInput) {
  await assertPair(input.categoryId, input.sizeId);
  try {
    return await prisma.diaSizeLink.create({ data: input, include: includeRefs });
  } catch (e) {
    rethrowDuplicate(e);
  }
}

export async function updateDiaSizeLink(id: number, input: Partial<DiaSizeLinkInput>) {
  const existing = await prisma.diaSizeLink.findUnique({ where: { id } });
  if (!existing) throw new ApiException(ErrorCode.DIA_LINK_NOT_FOUND, 404);
  const categoryId = input.categoryId ?? existing.categoryId;
  const sizeId = input.sizeId ?? existing.sizeId;
  await assertPair(categoryId, sizeId);
  try {
    return await prisma.diaSizeLink.update({
      where: { id },
      data: { ...input, categoryId, sizeId },
      include: includeRefs,
    });
  } catch (e) {
    rethrowDuplicate(e);
  }
}

export async function deleteDiaSizeLink(id: number) {
  const existing = await prisma.diaSizeLink.findUnique({ where: { id } });
  if (!existing) throw new ApiException(ErrorCode.DIA_LINK_NOT_FOUND, 404);
  await prisma.diaSizeLink.delete({ where: { id } });
  return { deleted: true };
}
