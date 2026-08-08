import {
  ErrorCode,
  SHORT_FLOW_TYPES,
  type CuttingEntryInput,
  type StretchingEntryInput,
  type StageEntryInput,
  type EntryEditInput,
  type QuotaInfo,
  type LotColorQuota,
} from "@erp/shared";
import { prisma } from "../db.js";
import { ApiException } from "../errors.js";
import {
  assertWithinQuota,
  ceilingForStage,
  cuttingQuota,
  pouchUsed,
  pouchUsedExcluding,
  stretchingUsed,
  stretchingUsedExcluding,
  pichiruUsed,
  pichiruUsedExcluding,
  packingUsed,
  packingUsedExcluding,
  effectiveQty,
  round2,
} from "./quota.js";

/** Job-work-given-outside lots skip pouch/stretching/kainool (cutting → packing). */
function isShortFlow(fabricationType: string): boolean {
  return (SHORT_FLOW_TYPES as readonly string[]).includes(fabricationType);
}

/** Stage → Prisma delegate name, for the generic list/delete helpers. */
const STAGE_MODELS = {
  cutting: "cuttingEntry",
  pouch: "pouchEntry",
  stretching: "stretchingEntry",
  pichiru: "pichiruEntry",
  packing: "packingEntry",
} as const;
export type StageName = keyof typeof STAGE_MODELS;

async function assertEmployee(employeeId: number) {
  const e = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!e) throw new ApiException(ErrorCode.EMPLOYEE_NOT_FOUND, 404);
}

/**
 * Loads a cutting lot for a work entry and enforces the lifecycle locks:
 * a completed cutting lot or a locked parent fabrication lot is frozen.
 */
async function getEntryCuttingLot(cuttingLotId: number) {
  const lot = await prisma.cuttingLot.findUnique({
    where: { id: cuttingLotId },
    include: { fabricationLot: true },
  });
  if (!lot) throw new ApiException(ErrorCode.CUTTING_LOT_NOT_FOUND, 404);
  if (lot.status === "completed" || lot.fabricationLot.locked) {
    throw new ApiException(ErrorCode.LOT_LOCKED, 400);
  }
  return lot;
}

/** Cutting sets/extends the base quota for a (cuttingLot, color). */
export async function createCutting(input: CuttingEntryInput) {
  await assertEmployee(input.employeeId);
  const lot = await getEntryCuttingLot(input.cuttingLotId);
  return prisma.cuttingEntry.create({
    data: {
      cuttingLotId: lot.id,
      color: input.color,
      dozen: input.dozen,
      pieces: input.pieces,
      employeeId: input.employeeId,
      date: input.date,
    },
  });
}

/** Pouch ≤ base cutting quota Q. */
export async function createPouch(input: StageEntryInput) {
  await assertEmployee(input.employeeId);
  const lot = await getEntryCuttingLot(input.cuttingLotId);
  if (isShortFlow(lot.fabricationLot.type))
    throw new ApiException(ErrorCode.STAGE_NOT_ALLOWED, 400);
  const { ceiling, emptyCode } = await ceilingForStage(lot.id, input.color, "pouch", false);
  const used = await pouchUsed(lot.id, input.color);
  assertWithinQuota(ceiling, used, effectiveQty(input.dozen, input.pieces), emptyCode);
  return prisma.pouchEntry.create({
    data: {
      cuttingLotId: lot.id,
      color: input.color,
      dozen: input.dozen,
      pieces: input.pieces,
      employeeId: input.employeeId,
      date: input.date,
    },
  });
}

/** Stretching: each sub-type independently ≤ pouch total (chain: pouch → stretching). */
export async function createStretching(input: StretchingEntryInput) {
  await assertEmployee(input.employeeId);
  const lot = await getEntryCuttingLot(input.cuttingLotId);
  if (isShortFlow(lot.fabricationLot.type))
    throw new ApiException(ErrorCode.STAGE_NOT_ALLOWED, 400);

  const type = await prisma.stretchingType.findUnique({
    where: { id: input.stretchingTypeId },
  });
  if (!type) throw new ApiException(ErrorCode.STRETCHING_TYPE_NOT_FOUND, 404);

  const { ceiling, emptyCode } = await ceilingForStage(lot.id, input.color, "stretching", false);
  const used = await stretchingUsed(lot.id, input.color, input.stretchingTypeId);
  assertWithinQuota(ceiling, used, effectiveQty(input.dozen, input.pieces), emptyCode);

  return prisma.stretchingEntry.create({
    data: {
      cuttingLotId: lot.id,
      color: input.color,
      stretchingTypeId: input.stretchingTypeId,
      dozen: input.dozen,
      pieces: input.pieces,
      employeeId: input.employeeId,
      date: input.date,
    },
  });
}

/** Kainool (pichiru) ≤ completed stretching (min across all active types). */
export async function createPichiru(input: StageEntryInput) {
  await assertEmployee(input.employeeId);
  const lot = await getEntryCuttingLot(input.cuttingLotId);
  if (isShortFlow(lot.fabricationLot.type))
    throw new ApiException(ErrorCode.STAGE_NOT_ALLOWED, 400);
  const { ceiling, emptyCode } = await ceilingForStage(lot.id, input.color, "pichiru", false);
  const used = await pichiruUsed(lot.id, input.color);
  assertWithinQuota(ceiling, used, effectiveQty(input.dozen, input.pieces), emptyCode);
  return prisma.pichiruEntry.create({
    data: {
      cuttingLotId: lot.id,
      color: input.color,
      dozen: input.dozen,
      pieces: input.pieces,
      employeeId: input.employeeId,
      date: input.date,
    },
  });
}

/**
 * Packing ceiling depends on the lot type:
 * - job-work-given-outside: ≤ base cutting quota (cutting → packing shortcut);
 * - every other type: ≤ kainool (pichiru) total.
 */
export async function createPacking(input: StageEntryInput) {
  await assertEmployee(input.employeeId);
  const lot = await getEntryCuttingLot(input.cuttingLotId);
  const shortFlow = isShortFlow(lot.fabricationLot.type);
  // `pickCeiling` carries the empty code, so the old explicit NO_PICHIRU_TOTAL
  // pre-check is now redundant — assertWithinQuota raises the identical error.
  const { ceiling, emptyCode } = await ceilingForStage(lot.id, input.color, "packing", shortFlow);
  const used = await packingUsed(lot.id, input.color);
  assertWithinQuota(ceiling, used, effectiveQty(input.dozen, input.pieces), emptyCode);
  return prisma.packingEntry.create({
    data: {
      cuttingLotId: lot.id,
      color: input.color,
      dozen: input.dozen,
      pieces: input.pieces,
      employeeId: input.employeeId,
      date: input.date,
    },
  });
}

/** Distinct colors that have a cutting quota for a cutting lot (populates dropdowns). */
export async function colorsForCuttingLot(cuttingLotId: number): Promise<string[]> {
  const rows = await prisma.cuttingEntry.findMany({
    where: { cuttingLotId },
    distinct: ["color"],
    select: { color: true },
    orderBy: { color: "asc" },
  });
  return rows.map((r) => r.color);
}

/** Remaining quota for a stage, so the form can show/limit the input live. */
export async function quotaInfo(
  cuttingLotId: number,
  color: string,
  stage: "pouch" | "stretching" | "pichiru" | "packing",
  stretchingTypeId?: number
): Promise<QuotaInfo> {
  const lot = await prisma.cuttingLot.findUnique({
    where: { id: cuttingLotId },
    include: { fabricationLot: { select: { type: true } } },
  });
  if (!lot) throw new ApiException(ErrorCode.CUTTING_LOT_NOT_FOUND, 404);
  const shortFlow = isShortFlow(lot.fabricationLot.type);

  if (stage === "stretching" && !stretchingTypeId)
    throw new ApiException(ErrorCode.STRETCHING_TYPE_NOT_FOUND, 400);

  // Ceiling follows the sequential chain — see `pickCeiling` in quota.ts, which
  // is the one place the chain is defined for create, edit and this read alike.
  const { ceiling: quota } = await ceilingForStage(cuttingLotId, color, stage, shortFlow);
  const used =
    stage === "pouch"
      ? await pouchUsed(cuttingLotId, color)
      : stage === "stretching"
        ? await stretchingUsed(cuttingLotId, color, stretchingTypeId!)
        : stage === "pichiru"
          ? await pichiruUsed(cuttingLotId, color)
          : await packingUsed(cuttingLotId, color);

  return { cuttingLotId, color, quota, used, remaining: round2(quota - used) };
}

/**
 * Every colour of a cutting lot with its standing at one stage — the whole-lot
 * overview the master entry screen shows the moment a lot is picked.
 *
 * Collapses what used to be one `/api/quota` request per colour into a single
 * call, and shares `ceilingForStage` with create/edit/quotaInfo so the numbers
 * shown can never disagree with the numbers enforced on save.
 */
export async function lotColorQuotas(
  cuttingLotId: number,
  stage: StageName,
  stretchingTypeId?: number
): Promise<LotColorQuota[]> {
  const lot = await prisma.cuttingLot.findUnique({
    where: { id: cuttingLotId },
    include: { fabricationLot: { select: { type: true } } },
  });
  if (!lot) throw new ApiException(ErrorCode.CUTTING_LOT_NOT_FOUND, 404);
  const shortFlow = isShortFlow(lot.fabricationLot.type);

  if (stage === "stretching" && !stretchingTypeId)
    throw new ApiException(ErrorCode.STRETCHING_TYPE_NOT_FOUND, 400);

  const colors = await colorsForCuttingLot(cuttingLotId);

  return Promise.all(
    colors.map(async (color): Promise<LotColorQuota> => {
      // Cutting has no upstream bound: what's "used" is the quota it establishes.
      if (stage === "cutting") {
        return { color, ceiling: null, used: await cuttingQuota(cuttingLotId, color), remaining: null };
      }
      const { ceiling } = await ceilingForStage(cuttingLotId, color, stage, shortFlow);
      const used =
        stage === "pouch"
          ? await pouchUsed(cuttingLotId, color)
          : stage === "stretching"
            ? await stretchingUsed(cuttingLotId, color, stretchingTypeId!)
            : stage === "pichiru"
              ? await pichiruUsed(cuttingLotId, color)
              : await packingUsed(cuttingLotId, color);
      return { color, ceiling, used, remaining: round2(ceiling - used) };
    })
  );
}

/* ------------------------------------------------------------------ *
 * Entry log — list / edit / delete (per stage, per cutting lot)
 * ------------------------------------------------------------------ */

/** All entries for a stage + cutting lot, newest first, with employee (+ type). */
export function listEntries(stage: StageName, cuttingLotId: number) {
  const model = (prisma as any)[STAGE_MODELS[stage]];
  return model.findMany({
    where: { cuttingLotId },
    include: {
      employee: { select: { id: true, name: true } },
      ...(stage === "stretching"
        ? { stretchingType: { select: { id: true, name: true } } }
        : {}),
    },
    orderBy: [{ date: "desc" }, { id: "desc" }],
  });
}

async function getEntryOr404(stage: StageName, id: number): Promise<any> {
  const model = (prisma as any)[STAGE_MODELS[stage]];
  const entry = await model.findUnique({ where: { id } });
  if (!entry) throw new ApiException(ErrorCode.ENTRY_NOT_FOUND, 404);
  return entry;
}

/** Delete an entry (blocked while the lot is locked/completed). */
export async function deleteEntry(stage: StageName, id: number) {
  const entry = await getEntryOr404(stage, id);
  await getEntryCuttingLot(entry.cuttingLotId);
  await (prisma as any)[STAGE_MODELS[stage]].delete({ where: { id } });
  return { deleted: true };
}

/**
 * Edit an entry's quantities/employee/date. The color (and stretching sub-type)
 * are unchanged, so the quota is re-checked against the same bucket, excluding
 * this entry. Cutting has no upstream ceiling; packing checks the pichiru total.
 */
export async function updateEntry(stage: StageName, id: number, input: EntryEditInput) {
  const entry = await getEntryOr404(stage, id);
  const cutLot = await getEntryCuttingLot(entry.cuttingLotId);
  await assertEmployee(input.employeeId);

  const req = effectiveQty(input.dozen, input.pieces);
  // Same ceiling source as create — only the "used" side differs, since this
  // entry's own quantity must be excluded from the bucket it is being edited in.
  if (stage !== "cutting") {
    const shortFlow = isShortFlow(cutLot.fabricationLot.type);
    const { ceiling, emptyCode } = await ceilingForStage(
      entry.cuttingLotId,
      entry.color,
      stage,
      shortFlow
    );
    const used =
      stage === "pouch"
        ? await pouchUsedExcluding(entry.cuttingLotId, entry.color, id)
        : stage === "stretching"
          ? await stretchingUsedExcluding(entry.cuttingLotId, entry.color, entry.stretchingTypeId, id)
          : stage === "pichiru"
            ? await pichiruUsedExcluding(entry.cuttingLotId, entry.color, id)
            : await packingUsedExcluding(entry.cuttingLotId, entry.color, id);
    assertWithinQuota(ceiling, used, req, emptyCode);
  }
  // (cutting has no upstream ceiling)

  return (prisma as any)[STAGE_MODELS[stage]].update({
    where: { id },
    data: {
      dozen: input.dozen,
      pieces: input.pieces ?? null,
      employeeId: input.employeeId,
      date: input.date,
    },
  });
}
