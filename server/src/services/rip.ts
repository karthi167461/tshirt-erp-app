import { ErrorCode, type RipCuttingInput, type RipInfo } from "@erp/shared";
import { prisma } from "../db.js";
import { ApiException } from "../errors.js";
import { round2 } from "./quota.js";

/** The rip material is the fabric on 12-dia rolls; its ceiling is their dyeing weight. */
const RIP_DIA = "12";

/** Rip material = Σ dyeing weight of the lot's 12-dia rolls. */
async function ripMaterial(fabricationLotId: number): Promise<number> {
  const rolls = await prisma.fabricationRoll.findMany({
    where: { fabricationLotId },
    select: { dia: true, dyeingWeight: true },
  });
  const total = rolls
    .filter((r) => r.dia.trim() === RIP_DIA && r.dyeingWeight != null)
    .reduce((sum, r) => sum + (r.dyeingWeight ?? 0), 0);
  return round2(total);
}

async function ripUsed(fabricationLotId: number): Promise<number> {
  const agg = await prisma.ripCuttingEntry.aggregate({
    where: { fabricationLotId },
    _sum: { weight: true },
  });
  return round2(agg._sum.weight ?? 0);
}

async function getLotOr404(fabricationLotId: number) {
  const lot = await prisma.fabricationLot.findUnique({ where: { id: fabricationLotId } });
  if (!lot) throw new ApiException(ErrorCode.FABRICATION_LOT_NOT_FOUND, 404);
  return lot;
}

/** Ledger for one lot: 12-dia dyeing weight (material) vs consumed rip weights. */
export async function ripInfo(fabricationLotId: number): Promise<RipInfo> {
  await getLotOr404(fabricationLotId);
  const [material, used, entries] = await Promise.all([
    ripMaterial(fabricationLotId),
    ripUsed(fabricationLotId),
    prisma.ripCuttingEntry.findMany({
      where: { fabricationLotId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    }),
  ]);
  return {
    fabricationLotId,
    material,
    used,
    remaining: round2(material - used),
    entries: entries.map((e) => ({
      id: e.id,
      weight: e.weight,
      createdAt: e.createdAt.toISOString(),
    })),
  };
}

/** Add a rip weight; must have 12-dia dyeing material and stay within remaining. */
export async function createRip(input: RipCuttingInput) {
  await getLotOr404(input.fabricationLotId);
  const material = await ripMaterial(input.fabricationLotId);
  if (material <= 0) throw new ApiException(ErrorCode.NO_RIP_MATERIAL, 400);
  const remaining = round2(material - (await ripUsed(input.fabricationLotId)));
  if (input.weight > remaining + 1e-9)
    throw new ApiException(ErrorCode.RIP_EXCEEDED, 400, { remaining });
  return prisma.ripCuttingEntry.create({
    data: { fabricationLotId: input.fabricationLotId, weight: input.weight },
  });
}

export async function deleteRip(id: number) {
  const entry = await prisma.ripCuttingEntry.findUnique({ where: { id } });
  if (!entry) throw new ApiException(ErrorCode.ENTRY_NOT_FOUND, 404);
  await prisma.ripCuttingEntry.delete({ where: { id } });
  return { deleted: true };
}

/** Fabrication lots that have a 12-dia (rip material) roll — for the Rip Cutting picker. */
export async function listRipLots() {
  const lots = await prisma.fabricationLot.findMany({
    orderBy: { createdAt: "desc" },
    include: { rolls: { select: { dia: true } } },
  });
  return lots
    .filter((l) => l.rolls.some((r) => r.dia.trim() === RIP_DIA))
    .map((l) => ({ id: l.id, lotNumber: l.lotNumber, type: l.type, status: l.status }));
}
