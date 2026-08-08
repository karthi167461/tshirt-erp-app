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
} from "@erp/shared";
import { prisma } from "../db.js";
import { ApiException } from "../errors.js";
import {
  round2,
  minCompleted,
  cuttingQuota,
  pouchUsed,
  stretchingTotalsByType,
  pichiruUsed,
  packingUsed,
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
    include: { fabricationLot: { select: { lotNumber: true, type: true } } },
  });
  if (!lot) throw new ApiException(ErrorCode.CUTTING_LOT_NOT_FOUND, 404);
  const shortFlow = (SHORT_FLOW_TYPES as readonly string[]).includes(lot.fabricationLot.type);

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
    const stretchCompletedQty = minCompleted([...usedByType.values()]);

    // Every active master type, plus any deactivated type that still has entries
    // (so turning a master off never hides work already done against it).
    const typeIds = [...new Set([...types.map((t) => t.id), ...usedByType.keys()])];
    const stretching: StretchingProgress[] = typeIds.map((typeId) => {
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

    const pichiru = await pichiruUsed(cuttingLotId, color);
    const packing = await packingUsed(cuttingLotId, color);

    const pouchP = stage(pouch, quota);
    const pichiruP = stage(pichiru, stretchCompletedQty);
    const packingP = stage(packing, shortFlow ? quota : pichiru);

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
      allStagesComplete: shortFlow
        ? packingP.complete
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
    totals,
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
