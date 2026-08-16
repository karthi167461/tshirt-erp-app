import { ErrorCode, type QuotaStage, type StageCeiling } from "@erp/shared";
import { prisma } from "../db.js";
import { ApiException } from "../errors.js";

/**
 * Pure quota check — kept free of DB access so it is directly unit-testable.
 * Uses a small epsilon so floating-point dozen sums don't spuriously fail.
 */
export function checkQuota(quota: number, used: number, requested: number) {
  const remaining = round2(quota - used);
  const ok = requested <= remaining + 1e-9;
  return { ok, remaining, wouldBe: round2(used + requested) };
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Effective quantity in dozens: dozen + pieces/12 (12 pieces = 1 dozen). */
export function effectiveQty(dozen: number, pieces?: number | null): number {
  return round2(dozen + (pieces ?? 0) / 12);
}

/** Sum of a stage's effective quantity (dozen + pieces/12) for a (cuttingLot, color). */
export function qtyFromSum(sum: { dozen: number | null; pieces: number | null }): number {
  return round2((sum.dozen ?? 0) + (sum.pieces ?? 0) / 12);
}

/** Cutting establishes the fixed base quota Q for a (cuttingLot, color). */
export async function cuttingQuota(cuttingLotId: number, color: string): Promise<number> {
  const agg = await prisma.cuttingEntry.aggregate({
    where: { cuttingLotId, color },
    _sum: { dozen: true, pieces: true },
  });
  return qtyFromSum(agg._sum);
}

export async function pouchUsed(cuttingLotId: number, color: string): Promise<number> {
  const agg = await prisma.pouchEntry.aggregate({
    where: { cuttingLotId, color },
    _sum: { dozen: true, pieces: true },
  });
  return qtyFromSum(agg._sum);
}

export async function stretchingUsed(
  cuttingLotId: number,
  color: string,
  stretchingTypeId: number
): Promise<number> {
  const agg = await prisma.stretchingEntry.aggregate({
    where: { cuttingLotId, color, stretchingTypeId },
    _sum: { dozen: true, pieces: true },
  });
  return qtyFromSum(agg._sum);
}

/**
 * Completed quantity across a set of buckets = the smallest bucket (0 if there
 * are none). Kainool's ceiling: since a lot's stretching types all carry the
 * same dozen, the completed amount is the minimum per-type total — the slowest
 * type is the bottleneck. Pure for unit testing.
 */
export function minCompleted(perTypeTotals: number[]): number {
  if (perTypeTotals.length === 0) return 0;
  return round2(Math.min(...perTypeTotals));
}

/**
 * Per-type stretching totals for a (lot, color) — only types ACTUALLY USED
 * appear as keys. Both `stretchCompleted` (the kainool ceiling) and analytics
 * read from this, so the two can never disagree about which types count.
 */
export async function stretchingTotalsByType(
  cuttingLotId: number,
  color: string
): Promise<Map<number, number>> {
  const sums = await prisma.stretchingEntry.groupBy({
    by: ["stretchingTypeId"],
    where: { cuttingLotId, color },
    _sum: { dozen: true, pieces: true },
  });
  return new Map(sums.map((s) => [s.stretchingTypeId, qtyFromSum(s._sum)]));
}

/**
 * Completed stretching for a (lot, color): the minimum total across the
 * stretching types ACTUALLY USED for this lot/color (types never applied to the
 * lot don't count — the master list holds category-specific types). Kainool's
 * ceiling; returns 0 until at least one stretching entry exists.
 */
export async function stretchCompleted(cuttingLotId: number, color: string): Promise<number> {
  const totals = await stretchingTotalsByType(cuttingLotId, color);
  return minCompleted([...totals.values()]);
}

export async function pichiruUsed(cuttingLotId: number, color: string): Promise<number> {
  const agg = await prisma.pichiruEntry.aggregate({
    where: { cuttingLotId, color },
    _sum: { dozen: true, pieces: true },
  });
  return qtyFromSum(agg._sum);
}

/** Packing's ceiling is the pichiru total (NOT the base cutting quota). */
export function pichiruTotal(cuttingLotId: number, color: string): Promise<number> {
  return pichiruUsed(cuttingLotId, color);
}

export async function packingUsed(cuttingLotId: number, color: string): Promise<number> {
  const agg = await prisma.packingEntry.aggregate({
    where: { cuttingLotId, color },
    _sum: { dozen: true, pieces: true },
  });
  return qtyFromSum(agg._sum);
}

/* --- "used" excluding one entry id — for re-validating an edit in place. --- */

export async function pouchUsedExcluding(cuttingLotId: number, color: string, excludeId: number) {
  const agg = await prisma.pouchEntry.aggregate({
    where: { cuttingLotId, color, id: { not: excludeId } },
    _sum: { dozen: true, pieces: true },
  });
  return qtyFromSum(agg._sum);
}

export async function stretchingUsedExcluding(
  cuttingLotId: number,
  color: string,
  stretchingTypeId: number,
  excludeId: number
) {
  const agg = await prisma.stretchingEntry.aggregate({
    where: { cuttingLotId, color, stretchingTypeId, id: { not: excludeId } },
    _sum: { dozen: true, pieces: true },
  });
  return qtyFromSum(agg._sum);
}

export async function pichiruUsedExcluding(cuttingLotId: number, color: string, excludeId: number) {
  const agg = await prisma.pichiruEntry.aggregate({
    where: { cuttingLotId, color, id: { not: excludeId } },
    _sum: { dozen: true, pieces: true },
  });
  return qtyFromSum(agg._sum);
}

export async function packingUsedExcluding(cuttingLotId: number, color: string, excludeId: number) {
  const agg = await prisma.packingEntry.aggregate({
    where: { cuttingLotId, color, id: { not: excludeId } },
    _sum: { dozen: true, pieces: true },
  });
  return qtyFromSum(agg._sum);
}

/**
 * Throws QUOTA_EXCEEDED (with the remaining count for the translated message)
 * when `requested` would push `used` past `quota`. Also guards the case where no
 * quota exists yet for this (lot, color).
 */
export function assertWithinQuota(
  quota: number,
  used: number,
  requested: number,
  emptyCode: string = ErrorCode.NO_CUTTING_QUOTA
) {
  if (quota <= 0) {
    throw new ApiException(emptyCode, 400);
  }
  const { ok, remaining } = checkQuota(quota, used, requested);
  if (!ok) {
    throw new ApiException(ErrorCode.QUOTA_EXCEEDED, 400, { remaining });
  }
}

/* --- The sequential chain, written down exactly once. --- */

/** Every upstream total a ceiling decision can depend on. */
export interface ChainTotals {
  cutting: number;
  pouch: number;
  stretchCompleted: number;
  pichiru: number;
}

/** A lot's stretching flow, reduced to what ceiling decisions need. */
export interface FlowInfo {
  id: number;
  skipKainool: boolean;
  /** Sorted by position ascending. */
  steps: { stretchingTypeId: number; position: number }[];
}

/** Per-lot context every ceiling decision depends on. */
export interface ChainOpts {
  shortFlow: boolean;
  skipKainool: boolean;
}

/**
 * PURE. The single source of truth for "what bounds this stage, and which error
 * do we raise when that bound is empty":
 *
 *   pouch ≤ cutting · stretching ≤ pouch · kainool ≤ completed stretching ·
 *   packing ≤ kainool — except job-work-given-outside lots, which skip the
 *   middle stages entirely and pack straight against the cutting quota, and
 *   skip-kainool flow lots, which pack straight against completed stretching.
 *
 * Kept DB-free so the whole chain is unit-testable; `ceilingForStage` is the
 * only thing that touches Prisma. Every create/update/read path goes through
 * here, so the three ceiling sites in entries.ts can no longer drift apart.
 *
 * The `stretching` branch is the legacy (flow-less lot) bound only —
 * `ceilingForStage` routes lots that carry a flow through `flowStepCeiling`.
 */
export function pickCeiling(
  stage: QuotaStage,
  totals: ChainTotals,
  opts: ChainOpts
): StageCeiling {
  switch (stage) {
    case "pouch":
      return { ceiling: totals.cutting, emptyCode: ErrorCode.NO_CUTTING_QUOTA };
    case "stretching":
      return { ceiling: totals.pouch, emptyCode: ErrorCode.NO_POUCH_TOTAL };
    case "pichiru":
      return { ceiling: totals.stretchCompleted, emptyCode: ErrorCode.NO_STRETCHING_TOTAL };
    case "packing":
      // Short flow packs against cutting; skip-kainool flows against completed
      // stretching; everything else against kainool. The empty code differs
      // too — a full-flow lot with no kainool must keep reporting
      // NO_PICHIRU_TOTAL, not the generic no-cutting-quota message.
      if (opts.shortFlow) {
        return { ceiling: totals.cutting, emptyCode: ErrorCode.NO_CUTTING_QUOTA };
      }
      if (opts.skipKainool) {
        return { ceiling: totals.stretchCompleted, emptyCode: ErrorCode.NO_STRETCHING_TOTAL };
      }
      return { ceiling: totals.pichiru, emptyCode: ErrorCode.NO_PICHIRU_TOTAL };
  }
}

/**
 * PURE. Ceiling for one stretching type on a lot that carries a flow: steps run
 * strictly in order, so step 1 is bounded by the pouch total and step i by what
 * step i-1 has entered (pouch 50, step 1 done 30 → step 2 may do at most 30; a
 * step whose predecessor hasn't started has ceiling 0). Types outside the flow
 * are rejected outright.
 */
export function flowStepCeiling(
  flow: FlowInfo,
  stretchingTypeId: number,
  pouchTotal: number,
  totalsByType: ReadonlyMap<number, number>
): StageCeiling {
  const idx = flow.steps.findIndex((s) => s.stretchingTypeId === stretchingTypeId);
  if (idx < 0) {
    throw new ApiException(ErrorCode.FLOW_STEP_NOT_ALLOWED, 400);
  }
  if (idx === 0) {
    return { ceiling: pouchTotal, emptyCode: ErrorCode.NO_POUCH_TOTAL };
  }
  const prev = flow.steps[idx - 1];
  return {
    ceiling: round2(totalsByType.get(prev.stretchingTypeId) ?? 0),
    emptyCode: ErrorCode.NO_PREV_STEP_TOTAL,
  };
}

/**
 * PURE. Completed stretching for a flow lot: the minimum total across ALL flow
 * steps (a step with no entries counts as 0). Under enforced sequencing this
 * equals the last step's total, but the min stays safe when an edit or delete
 * of an earlier step's entry leaves step i below step i+1 — edits only
 * re-validate themselves, never downstream steps.
 */
export function flowStretchCompleted(
  flow: FlowInfo,
  totalsByType: ReadonlyMap<number, number>
): number {
  return minCompleted(flow.steps.map((s) => totalsByType.get(s.stretchingTypeId) ?? 0));
}

/** Per-lot chain context: the fabrication short flow plus the optional stretching flow. */
export interface ChainCtx {
  shortFlow: boolean;
  flow: FlowInfo | null;
}

export function chainOpts(ctx: ChainCtx): ChainOpts {
  return { shortFlow: ctx.shortFlow, skipKainool: ctx.flow?.skipKainool ?? false };
}

/**
 * Loads only the aggregate the stage actually needs, then delegates the decision
 * to `pickCeiling` / `flowStepCeiling`. Same number of round-trips as the inline
 * branches it replaces (flow-lot stretching needs two: pouch + per-type totals).
 */
export async function ceilingForStage(
  cuttingLotId: number,
  color: string,
  stage: QuotaStage,
  ctx: ChainCtx,
  stretchingTypeId?: number
): Promise<StageCeiling> {
  const opts = chainOpts(ctx);
  if (stage === "stretching" && ctx.flow) {
    if (!stretchingTypeId) {
      throw new ApiException(ErrorCode.STRETCHING_TYPE_NOT_FOUND, 400);
    }
    const [pouchTotal, totals] = await Promise.all([
      pouchUsed(cuttingLotId, color),
      stretchingTotalsByType(cuttingLotId, color),
    ]);
    return flowStepCeiling(ctx.flow, stretchingTypeId, pouchTotal, totals);
  }
  const totals: ChainTotals = { cutting: 0, pouch: 0, stretchCompleted: 0, pichiru: 0 };
  if (stage === "pouch" || (stage === "packing" && opts.shortFlow)) {
    totals.cutting = await cuttingQuota(cuttingLotId, color);
  } else if (stage === "stretching") {
    totals.pouch = await pouchUsed(cuttingLotId, color);
  } else if (stage === "pichiru" || (stage === "packing" && opts.skipKainool)) {
    totals.stretchCompleted = ctx.flow
      ? flowStretchCompleted(ctx.flow, await stretchingTotalsByType(cuttingLotId, color))
      : await stretchCompleted(cuttingLotId, color);
  } else {
    totals.pichiru = await pichiruTotal(cuttingLotId, color);
  }
  return pickCeiling(stage, totals, opts);
}
