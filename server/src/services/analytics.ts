import {
  ErrorCode,
  SHORT_FLOW_TYPES,
  weekStartOf,
  weekEndOf,
  type LotAnalytics,
  type ColorAnalytics,
  type LotTotals,
  type StageProgress,
  type StretchingProgress,
  type WeekAnalytics,
  type WeekGroup,
  type FabricationAnalytics,
  type FabricationCuttingLotSummary,
} from "@erp/shared";
import { prisma } from "../db.js";
import { ApiException } from "../errors.js";
import {
  round2,
  minCompleted,
  cuttingQuota,
  pouchUsed,
  stretchingTotalsByType,
  flowStepCeiling,
  flowStretchCompleted,
  pichiruUsed,
  packingUsed,
  qtyFromSum,
  type FlowInfo,
} from "./quota.js";

function percent(done: number, ceiling: number): number {
  if (ceiling <= 0) return 0;
  return round2(Math.min(100, (done / ceiling) * 100));
}

/**
 * Progress of one stage against its OWN upstream bound. A stage with a zero
 * ceiling hasn't been unblocked yet, so it is neither complete nor at 0% of
 * something meaningful — the UI renders it as "not started".
 */
function stage(done: number, ceiling: number): StageProgress {
  return {
    done,
    ceiling,
    percent: percent(done, ceiling),
    complete: ceiling > 0 && done >= ceiling - 1e-9,
  };
}

/** Per-cutting-lot, per-color progress across all stages. Packing = final stage. */
export async function cuttingLotAnalytics(cuttingLotId: number): Promise<LotAnalytics> {
  const lot = await prisma.cuttingLot.findUnique({
    where: { id: cuttingLotId },
    include: {
      fabricationLot: { select: { lotNumber: true, type: true } },
      stretchingFlow: {
        include: {
          steps: {
            orderBy: { position: "asc" },
            include: { stretchingType: { select: { name: true } } },
          },
        },
      },
    },
  });
  if (!lot) throw new ApiException(ErrorCode.CUTTING_LOT_NOT_FOUND, 404);
  const shortFlow = (SHORT_FLOW_TYPES as readonly string[]).includes(lot.fabricationLot.type);

  // Mirrors lotCtx in entries.ts — analytics MUST bound stages the same way the
  // write path does, or the numbers shown would disagree with those enforced.
  const flow: FlowInfo | null = lot.stretchingFlow
    ? {
        id: lot.stretchingFlow.id,
        skipKainool: lot.stretchingFlow.skipKainool,
        steps: lot.stretchingFlow.steps.map((s) => ({
          stretchingTypeId: s.stretchingTypeId,
          position: s.position,
        })),
      }
    : null;
  const kainoolSkipped = !shortFlow && !!flow?.skipKainool;
  const flowStepName = new Map(
    (lot.stretchingFlow?.steps ?? []).map((s) => [s.stretchingTypeId, s.stretchingType.name])
  );

  // Distinct colors that have cutting entries.
  const colorRows = await prisma.cuttingEntry.findMany({
    where: { cuttingLotId },
    distinct: ["color"],
    select: { color: true },
  });

  const types = await prisma.stretchingType.findMany({
    where: { active: true },
    orderBy: { id: "asc" },
  });
  const typeName = new Map(types.map((t) => [t.id, t.name]));

  const colors: ColorAnalytics[] = [];
  for (const { color } of colorRows) {
    const quota = await cuttingQuota(cuttingLotId, color);
    const pouch = await pouchUsed(cuttingLotId, color);

    // Same source the kainool ceiling uses, so "which types count" can't drift.
    const usedByType = await stretchingTotalsByType(cuttingLotId, color);
    const stretchCompletedQty = flow
      ? flowStretchCompleted(flow, usedByType)
      : minCompleted([...usedByType.values()]);

    let stretching: StretchingProgress[];
    if (flow) {
      // Flow lots: one row per step, in order, each bounded exactly the way the
      // write path bounds it (step 1 ≤ pouch, step i ≤ step i-1's total). Every
      // step counts — an unstarted step is real pending work, unlike the legacy
      // "unused master types don't block" rule below.
      stretching = flow.steps.map((s) => {
        const done = usedByType.get(s.stretchingTypeId) ?? 0;
        const { ceiling } = flowStepCeiling(flow, s.stretchingTypeId, pouch, usedByType);
        return {
          typeId: s.stretchingTypeId,
          typeName:
            flowStepName.get(s.stretchingTypeId) ??
            typeName.get(s.stretchingTypeId) ??
            `#${s.stretchingTypeId}`,
          used: true,
          stepOrder: s.position,
          ...stage(done, ceiling),
        };
      });
      // Entries against types outside the flow (from before a flow edit) stay
      // visible as legacy rows so work already done is never hidden.
      const stepIds = new Set(flow.steps.map((s) => s.stretchingTypeId));
      for (const [typeId, done] of usedByType) {
        if (!stepIds.has(typeId)) {
          stretching.push({
            typeId,
            typeName: typeName.get(typeId) ?? `#${typeId}`,
            used: true,
            ...stage(done, pouch),
          });
        }
      }
    } else {
      // Every active master type, plus any deactivated type that still has entries
      // (so turning a master off never hides work already done against it).
      const typeIds = [...new Set([...types.map((t) => t.id), ...usedByType.keys()])];
      stretching = typeIds.map((typeId) => {
        const used = usedByType.has(typeId);
        const done = usedByType.get(typeId) ?? 0;
        // An unused type has no ceiling — the shop runs 11 category-specific
        // types and only a few apply to any one lot, so counting them all would
        // mean no lot could ever read as complete.
        return {
          typeId,
          typeName: typeName.get(typeId) ?? `#${typeId}`,
          used,
          ...stage(done, used ? pouch : 0),
        };
      });
    }

    const pichiru = await pichiruUsed(cuttingLotId, color);
    const packing = await packingUsed(cuttingLotId, color);

    const pouchP = stage(pouch, quota);
    // Skipped kainool renders as "not started" (ceiling 0) and never blocks.
    const pichiruP = stage(pichiru, kainoolSkipped ? 0 : stretchCompletedQty);
    const packingP = stage(
      packing,
      shortFlow ? quota : kainoolSkipped ? stretchCompletedQty : pichiru
    );

    colors.push({
      color,
      quota,
      pouch: pouchP,
      stretching,
      pichiru: pichiruP,
      packing: packingP,
      // Unchanged meaning: packing has reached the ORIGINAL cutting quota.
      completed: quota > 0 && packing >= quota - 1e-9,
      stretchCompleted: stretchCompletedQty,
      shortFlow,
      kainoolSkipped,
      allStagesComplete: shortFlow
        ? packingP.complete
        : flow
          ? pouchP.complete &&
            stretching.every((s) => s.complete) &&
            (kainoolSkipped || pichiruP.complete) &&
            packingP.complete
          : pouchP.complete &&
            stretching.filter((s) => s.used).every((s) => s.complete) &&
            usedByType.size > 0 &&
            pichiruP.complete &&
            packingP.complete,
    });
  }

  colors.sort((a, b) => a.color.localeCompare(b.color));

  const totals: LotTotals = {
    quota: round2(colors.reduce((n, c) => n + c.quota, 0)),
    pouch: round2(colors.reduce((n, c) => n + c.pouch.done, 0)),
    stretching: [...new Set(colors.flatMap((c) => c.stretching.filter((s) => s.used).map((s) => s.typeId)))].map(
      (typeId) => ({
        typeId,
        typeName: typeName.get(typeId) ?? `#${typeId}`,
        done: round2(
          colors.reduce((n, c) => n + (c.stretching.find((s) => s.typeId === typeId)?.done ?? 0), 0)
        ),
      })
    ),
    pichiru: round2(colors.reduce((n, c) => n + c.pichiru.done, 0)),
    packing: round2(colors.reduce((n, c) => n + c.packing.done, 0)),
    colorsComplete: colors.filter((c) => c.completed).length,
    colorsTotal: colors.length,
  };

  return {
    cuttingLotId: lot.id,
    cuttingLotNumber: lot.cuttingLotNumber,
    fabricationLotNumber: lot.fabricationLot.lotNumber,
    colors,
    shortFlow,
    flow: lot.stretchingFlow
      ? {
          id: lot.stretchingFlow.id,
          name: lot.stretchingFlow.name,
          skipKainool: lot.stretchingFlow.skipKainool,
          steps: lot.stretchingFlow.steps.map((s) => ({
            typeId: s.stretchingTypeId,
            typeName: s.stretchingType.name,
            position: s.position,
          })),
        }
      : null,
    kainoolSkipped,
    totals,
  };
}

/**
 * Fabrication-level analytics for the Analytics drill-down: the lot with its
 * rolls, weight totals, and every cutting lot's whole-lot cut/packed rollup.
 * Two groupBy aggregates cover ALL cutting lots — no per-lot round trips.
 */
export async function fabricationLotAnalytics(
  fabricationLotId: number
): Promise<FabricationAnalytics> {
  const lot = await prisma.fabricationLot.findUnique({
    where: { id: fabricationLotId },
    include: {
      rolls: { orderBy: { id: "asc" } },
      cuttingLots: {
        orderBy: { createdAt: "desc" },
        include: {
          category: { select: { name: true } },
          size: { select: { name: true } },
          stretchingFlow: { select: { name: true } },
        },
      },
    },
  });
  if (!lot) throw new ApiException(ErrorCode.FABRICATION_LOT_NOT_FOUND, 404);

  const ids = lot.cuttingLots.map((c) => c.id);
  const [cutSums, packSums] = ids.length
    ? await Promise.all([
        prisma.cuttingEntry.groupBy({
          by: ["cuttingLotId"],
          where: { cuttingLotId: { in: ids } },
          _sum: { dozen: true, pieces: true },
        }),
        prisma.packingEntry.groupBy({
          by: ["cuttingLotId"],
          where: { cuttingLotId: { in: ids } },
          _sum: { dozen: true, pieces: true },
        }),
      ])
    : [[], []];
  const cutBy = new Map(cutSums.map((s) => [s.cuttingLotId, qtyFromSum(s._sum)]));
  const packedBy = new Map(packSums.map((s) => [s.cuttingLotId, qtyFromSum(s._sum)]));

  const cuttingLots: FabricationCuttingLotSummary[] = lot.cuttingLots.map((c) => ({
    id: c.id,
    cuttingLotNumber: c.cuttingLotNumber,
    dia: c.dia,
    categoryName: c.category.name,
    sizeName: c.size.name,
    status: c.status,
    stretchingFlowName: c.stretchingFlow?.name ?? null,
    cut: cutBy.get(c.id) ?? 0,
    packed: packedBy.get(c.id) ?? 0,
  }));

  return {
    id: lot.id,
    lotNumber: lot.lotNumber,
    type: lot.type as FabricationAnalytics["type"],
    status: lot.status,
    locked: lot.locked,
    createdAt: lot.createdAt.toISOString(),
    shortFlow: (SHORT_FLOW_TYPES as readonly string[]).includes(lot.type),
    rolls: lot.rolls.map((r) => ({
      id: r.id,
      dia: r.dia,
      rollCount: r.rollCount,
      weight: r.weight,
      texturePinnal: r.texturePinnal,
      fabricationWeight: r.fabricationWeight,
      dyeingWeight: r.dyeingWeight,
    })),
    totals: {
      rollCount: lot.rolls.reduce((n, r) => n + r.rollCount, 0),
      greigeWeight: round2(lot.rolls.reduce((n, r) => n + r.weight, 0)),
      fabricationWeight: round2(lot.rolls.reduce((n, r) => n + (r.fabricationWeight ?? 0), 0)),
      dyeingWeight: round2(lot.rolls.reduce((n, r) => n + (r.dyeingWeight ?? 0), 0)),
    },
    cuttingLots,
  };
}

/** Lightweight cutting-lot list for pickers, newest first. */
export async function listCuttingLots() {
  const rows = await prisma.cuttingLot.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      cuttingLotNumber: true,
      status: true,
      createdAt: true,
      fabricationLot: { select: { lotNumber: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    cuttingLotNumber: r.cuttingLotNumber,
    fabricationLotNumber: r.fabricationLot.lotNumber,
    status: r.status,
    createdAt: r.createdAt,
  }));
}

/** Week-wise progress: fabrication + cutting lots created in the week, by status. */
export async function weekAnalytics(dateInWeek: string): Promise<WeekAnalytics> {
  const weekStart = weekStartOf(dateInWeek);
  const weekEnd = weekEndOf(dateInWeek);
  const range = {
    gte: new Date(`${weekStart}T00:00:00`),
    lte: new Date(`${weekEnd}T23:59:59.999`),
  };

  const fabLots = await prisma.fabricationLot.findMany({
    where: { createdAt: range },
    orderBy: { createdAt: "desc" },
    select: { id: true, lotNumber: true, status: true },
  });
  const cutLots = await prisma.cuttingLot.findMany({
    where: { createdAt: range },
    orderBy: { createdAt: "desc" },
    select: { id: true, cuttingLotNumber: true, status: true },
  });

  // Fabrication "completed" = ready (setup done → available for cutting).
  const fabrication: WeekGroup = groupByCompletion(
    fabLots.map((l) => ({ id: l.id, number: l.lotNumber, status: l.status, completed: l.status === "ready" }))
  );
  // Cutting "completed" = status completed.
  const cutting: WeekGroup = groupByCompletion(
    cutLots.map((l) => ({ id: l.id, number: l.cuttingLotNumber, status: l.status, completed: l.status === "completed" }))
  );

  return { weekStart, weekEnd, fabrication, cutting };
}

function groupByCompletion(
  lots: { id: number; number: string; status: string; completed: boolean }[]
): WeekGroup {
  const completed = lots.filter((l) => l.completed).length;
  return { total: lots.length, completed, inProgress: lots.length - completed, lots };
}
