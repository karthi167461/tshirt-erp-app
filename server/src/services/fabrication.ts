import {
  ErrorCode,
  type FabricationLotInput,
  type FabricationTypeInput,
  type FabricationRollInput,
  type FabricationStage1Input,
  type FabricationStage2Input,
  type FabricationStatusInput,
  type FabricationLockInput,
  type FabricationRenameInput,
} from "@erp/shared";
import { prisma } from "../db.js";
import { ApiException } from "../errors.js";
import { paginate } from "./pagination.js";

/** Fabrication lots, newest first. `status` filter (e.g. "ready") is optional. */
export function listFabricationLots(status?: string) {
  return prisma.fabricationLot.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
    include: { rolls: { orderBy: { id: "asc" } } },
  });
}

/** Ready + UNLOCKED lots — the only ones selectable for new cutting lots. */
export function listReadyLots() {
  return prisma.fabricationLot.findMany({
    where: { status: "ready", locked: false },
    orderBy: { createdAt: "desc" },
    include: { rolls: { orderBy: { id: "asc" } } },
  });
}

/** Paginated fabrication lots with optional lot-number search + status filter. */
export function listFabricationLotsPaged(opts: {
  search?: string;
  status?: string;
  page: number;
  pageSize: number;
}) {
  const where = {
    ...(opts.status ? { status: opts.status } : {}),
    ...(opts.search ? { lotNumber: { contains: opts.search } } : {}),
  };
  return paginate(
    opts.page,
    opts.pageSize,
    () => prisma.fabricationLot.count({ where }),
    (skip, take) =>
      prisma.fabricationLot.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: { rolls: { orderBy: { id: "asc" } } },
        skip,
        take,
      })
  );
}

export async function getFabricationLot(id: number) {
  const lot = await prisma.fabricationLot.findUnique({
    where: { id },
    include: { rolls: { orderBy: { id: "asc" } } },
  });
  if (!lot) throw new ApiException(ErrorCode.FABRICATION_LOT_NOT_FOUND, 404);
  return lot;
}

export async function createFabricationLot(input: FabricationLotInput) {
  try {
    return await prisma.fabricationLot.create({
      data: { lotNumber: input.lotNumber, type: input.type },
    });
  } catch (e) {
    if (e && typeof e === "object" && (e as any).code === "P2002") {
      throw new ApiException(ErrorCode.DUPLICATE_LOT, 400);
    }
    throw e;
  }
}

/** Rename a lot (edit its lot number). Allowed while unlocked; must stay unique. */
export async function setName(lotId: number, input: FabricationRenameInput) {
  await assertLotUnlocked(lotId);
  try {
    return await prisma.fabricationLot.update({
      where: { id: lotId },
      data: { lotNumber: input.lotNumber },
    });
  } catch (e) {
    if (e && typeof e === "object" && (e as any).code === "P2002") {
      throw new ApiException(ErrorCode.DUPLICATE_LOT, 400);
    }
    throw e;
  }
}

/** Change a lot's type (own / job-work variants). Allowed while unlocked. */
export async function setType(lotId: number, input: FabricationTypeInput) {
  await assertLotUnlocked(lotId);
  return prisma.fabricationLot.update({
    where: { id: lotId },
    data: { type: input.type },
  });
}

async function getLotOr404(id: number) {
  const lot = await prisma.fabricationLot.findUnique({ where: { id } });
  if (!lot) throw new ApiException(ErrorCode.FABRICATION_LOT_NOT_FOUND, 404);
  return lot;
}

async function getRollOr404(rollId: number) {
  const roll = await prisma.fabricationRoll.findUnique({ where: { id: rollId } });
  if (!roll) throw new ApiException(ErrorCode.FABRICATION_ROLL_NOT_FOUND, 404);
  return roll;
}

async function assertLotUnlocked(fabricationLotId: number) {
  const lot = await prisma.fabricationLot.findUnique({ where: { id: fabricationLotId } });
  if (!lot) throw new ApiException(ErrorCode.FABRICATION_LOT_NOT_FOUND, 404);
  if (lot.locked) throw new ApiException(ErrorCode.LOT_LOCKED, 400);
  return lot;
}

export async function addRoll(lotId: number, input: FabricationRollInput) {
  await assertLotUnlocked(lotId);
  return prisma.fabricationRoll.create({
    data: { fabricationLotId: lotId, ...input },
  });
}

/** Edit an existing roll's created fields (dia/rollCount/weight/texturePinnal). */
export async function updateRoll(
  rollId: number,
  data: Partial<FabricationRollInput>
) {
  const roll = await getRollOr404(rollId);
  await assertLotUnlocked(roll.fabricationLotId);
  return prisma.fabricationRoll.update({ where: { id: rollId }, data });
}

export async function deleteRoll(rollId: number) {
  const roll = await getRollOr404(rollId);
  await assertLotUnlocked(roll.fabricationLotId);
  await prisma.fabricationRoll.delete({ where: { id: rollId } });
  return { deleted: true };
}

/**
 * Recording a fabrication weight moves the lot draft → dyeing.
 * `updateMany` with a status filter keeps the transition forward-only.
 */
export async function updateStage1(rollId: number, input: FabricationStage1Input) {
  const roll = await getRollOr404(rollId);
  const updated = await prisma.fabricationRoll.update({
    where: { id: rollId },
    data: { fabricationWeight: input.fabricationWeight },
  });
  await prisma.fabricationLot.updateMany({
    where: { id: roll.fabricationLotId, status: "draft" },
    data: { status: "dyeing" },
  });
  return updated;
}

/** Recording a dyeing weight moves the lot (draft|dyeing) → ready. */
export async function updateStage2(rollId: number, input: FabricationStage2Input) {
  const roll = await getRollOr404(rollId);
  const updated = await prisma.fabricationRoll.update({
    where: { id: rollId },
    data: { dyeingWeight: input.dyeingWeight },
  });
  await prisma.fabricationLot.updateMany({
    where: { id: roll.fabricationLotId, status: { in: ["draft", "dyeing"] } },
    data: { status: "ready" },
  });
  return updated;
}

export async function setStatus(lotId: number, input: FabricationStatusInput) {
  await getLotOr404(lotId);
  return prisma.fabricationLot.update({
    where: { id: lotId },
    data: { status: input.status },
  });
}

export async function setLock(lotId: number, input: FabricationLockInput) {
  await getLotOr404(lotId);
  return prisma.fabricationLot.update({
    where: { id: lotId },
    data: { locked: input.locked },
  });
}
