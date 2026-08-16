import { ErrorCode, type CuttingLotInput } from "@erp/shared";
import { prisma } from "../db.js";
import { ApiException } from "../errors.js";
import { paginate } from "./pagination.js";
import { isShortFlow } from "./entries.js";

const includeRefs = {
  category: true,
  size: true,
  fabricationLot: { select: { id: true, lotNumber: true, locked: true, status: true, type: true } },
  stretchingFlow: { select: { id: true, name: true, skipKainool: true } },
} as const;

async function assertStretchingFlow(id: number, requireActive: boolean) {
  const flow = await prisma.stretchingFlow.findUnique({ where: { id } });
  if (!flow || (requireActive && !flow.active))
    throw new ApiException(ErrorCode.STRETCHING_FLOW_NOT_FOUND, 404);
}

/** Create a cutting lot against a READY, unlocked fabrication lot. */
export async function createCuttingLot(input: CuttingLotInput) {
  const fab = await prisma.fabricationLot.findUnique({
    where: { id: input.fabricationLotId },
  });
  if (!fab) throw new ApiException(ErrorCode.FABRICATION_LOT_NOT_FOUND, 404);
  if (fab.status !== "ready") throw new ApiException(ErrorCode.FABRICATION_NOT_READY, 400);
  if (fab.locked) throw new ApiException(ErrorCode.LOT_LOCKED, 400);

  // Every new full-flow lot must carry a stretching flow; short-flow
  // (job-given-out) lots never stretch, so they are exempt and stay null.
  const shortFlow = isShortFlow(fab.type);
  if (!shortFlow && !input.stretchingFlowId)
    throw new ApiException(ErrorCode.FLOW_REQUIRED, 400);
  const stretchingFlowId = shortFlow ? null : input.stretchingFlowId!;
  if (stretchingFlowId) await assertStretchingFlow(stretchingFlowId, true);

  const category = await prisma.category.findUnique({ where: { id: input.categoryId } });
  if (!category) throw new ApiException(ErrorCode.CATEGORY_NOT_FOUND, 404);
  const size = await prisma.size.findUnique({ where: { id: input.sizeId } });
  if (!size || size.categoryId !== input.categoryId)
    throw new ApiException(ErrorCode.SIZE_NOT_FOUND, 404);

  try {
    return await prisma.cuttingLot.create({
      data: {
        cuttingLotNumber: input.cuttingLotNumber,
        fabricationLotId: input.fabricationLotId,
        dia: input.dia,
        categoryId: input.categoryId,
        sizeId: input.sizeId,
        stretchingFlowId,
      },
      include: includeRefs,
    });
  } catch (e) {
    if (e && typeof e === "object" && (e as any).code === "P2002") {
      throw new ApiException(ErrorCode.DUPLICATE_LOT, 400);
    }
    throw e;
  }
}

/** Paginated cutting lots. Search matches the cutting lot number OR its fabrication lot number. */
export function listCuttingLotsPaged(opts: {
  search?: string;
  status?: string;
  page: number;
  pageSize: number;
}) {
  const where = {
    ...(opts.status ? { status: opts.status } : {}),
    ...(opts.search
      ? {
          OR: [
            { cuttingLotNumber: { contains: opts.search } },
            { fabricationLot: { lotNumber: { contains: opts.search } } },
          ],
        }
      : {}),
  };
  return paginate(
    opts.page,
    opts.pageSize,
    () => prisma.cuttingLot.count({ where }),
    (skip, take) =>
      prisma.cuttingLot.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: includeRefs,
        skip,
        take,
      })
  );
}

/** Active cutting lots (unpaginated) for downstream stage pickers. */
export function listActiveCuttingLots() {
  return prisma.cuttingLot.findMany({
    where: { status: "active" },
    orderBy: { createdAt: "desc" },
    include: includeRefs,
  });
}

export async function getCuttingLot(id: number) {
  const lot = await prisma.cuttingLot.findUnique({ where: { id }, include: includeRefs });
  if (!lot) throw new ApiException(ErrorCode.CUTTING_LOT_NOT_FOUND, 404);
  return lot;
}

/** Edit a cutting lot's header fields (number / dia / category / size / fabrication). */
export async function updateCuttingLot(
  id: number,
  input: Partial<CuttingLotInput>
) {
  await getCuttingLot(id);
  if (input.sizeId) {
    const size = await prisma.size.findUnique({ where: { id: input.sizeId } });
    const categoryId = input.categoryId ?? (await prisma.cuttingLot.findUnique({ where: { id } }))!.categoryId;
    if (!size || size.categoryId !== categoryId)
      throw new ApiException(ErrorCode.SIZE_NOT_FOUND, 404);
  }
  // Reassigning the flow on a lot with entries is allowed — quota is enforced at
  // write time only, so the chain semantics simply change for FUTURE entries.
  if (input.stretchingFlowId) await assertStretchingFlow(input.stretchingFlowId, false);
  return prisma.cuttingLot.update({ where: { id }, data: input, include: includeRefs });
}

/** Delete a cutting lot only if no stage entry links to it. */
export async function deleteCuttingLot(id: number) {
  await getCuttingLot(id);
  const counts = await Promise.all([
    prisma.cuttingEntry.count({ where: { cuttingLotId: id } }),
    prisma.pouchEntry.count({ where: { cuttingLotId: id } }),
    prisma.stretchingEntry.count({ where: { cuttingLotId: id } }),
    prisma.pichiruEntry.count({ where: { cuttingLotId: id } }),
    prisma.packingEntry.count({ where: { cuttingLotId: id } }),
  ]);
  if (counts.some((c) => c > 0)) throw new ApiException(ErrorCode.IN_USE, 400);
  await prisma.cuttingLot.delete({ where: { id } });
  return { deleted: true };
}

/** Bulk set cutting lots completed (or revert to active when completed=false). */
export async function setCuttingLotsCompleted(ids: number[], completed: boolean) {
  await prisma.cuttingLot.updateMany({
    where: { id: { in: ids } },
    data: { status: completed ? "completed" : "active" },
  });
  return { updated: ids.length, completed };
}
