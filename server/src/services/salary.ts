import {
  ErrorCode,
  weekStartOf,
  weekEndOf,
  type SalaryBreakdown,
  type SalaryLine,
  type WeekSalaryRow,
  type WeekSalarySheet,
} from "@erp/shared";
import { prisma, getSettings } from "../db.js";
import { ApiException } from "../errors.js";
import { round2 } from "./quota.js";
import { cuttingRateMap, pouchRateMap, stretchingRateResolver } from "./pricing.js";

const qty = (dozen: number, pieces: number | null) =>
  dozen + (pieces ?? 0) / 12;

/** Everything needed to price an entry, loaded once per computation. */
interface Rates {
  settings: { qcPricePerDozen: number; packingPricePerDozen: number };
  cutting: Awaited<ReturnType<typeof cuttingRateMap>>;
  pouch: Awaited<ReturnType<typeof pouchRateMap>>;
  stretching: Awaited<ReturnType<typeof stretchingRateResolver>>;
}

async function loadRates(): Promise<Rates> {
  const [settings, cutting, pouch, stretching] = await Promise.all([
    getSettings(),
    cuttingRateMap(),
    pouchRateMap(),
    stretchingRateResolver(),
  ]);
  return { settings, cutting, pouch, stretching };
}

/**
 * Per-stage rate resolution, in ONE place. Both the day-wise breakdown and the
 * all-employee week sheet price entries through these, so the sheet's totals can
 * never disagree with the payslip an employee is shown.
 */
const rateFor = {
  cutting: (r: Rates, e: any) =>
    r.cutting.get(`${e.cuttingLot.categoryId}:${e.cuttingLot.sizeId}`) ?? 0,
  pouch: (r: Rates, e: any) => r.pouch.get(e.cuttingLot.categoryId) ?? 0,
  stretching: (r: Rates, e: any) =>
    r.stretching.resolve(e.stretchingTypeId, e.cuttingLot.size.name, e.stretchingType.amountPerDozen),
  pichiru: (r: Rates) => r.settings.qcPricePerDozen,
  packing: (r: Rates) => r.settings.packingPricePerDozen,
};

/**
 * Day-wise salary lines for one employee in a week, bucketed by (date, rate
 * source). Rates: cutting = CuttingPrice[category,size], pouch = PouchPrice
 * [category], stretching = type size-range slab (fallback: type rate), pichiru/
 * packing = flat settings. Missing price → rate 0 (never NaN). Shared by the
 * live preview and the saved snapshot.
 */
/** One entry, already priced — the common currency between the two callers. */
interface PricedEntry {
  employeeId: number;
  date: string;
  section: SalaryLine["section"];
  label: string;
  rate: number;
  dozenEquiv: number;
}

/**
 * Fetch and price every entry matching `where` (which may or may not pin an
 * employee). One query per stage regardless of how many employees match, so the
 * all-employee sheet costs the same five reads as a single payslip.
 */
async function pricedEntries(
  where: { employeeId?: number; date: { gte: string; lte: string } },
  rates: Rates
): Promise<PricedEntry[]> {
  const [cutting, pouch, stretching, pichiru, packing] = await Promise.all([
    prisma.cuttingEntry.findMany({
      where,
      include: { cuttingLot: { include: { category: true, size: true } } },
    }),
    prisma.pouchEntry.findMany({
      where,
      include: { cuttingLot: { include: { category: true } } },
    }),
    prisma.stretchingEntry.findMany({
      where,
      include: { stretchingType: true, cuttingLot: { include: { size: true } } },
    }),
    prisma.pichiruEntry.findMany({ where }),
    prisma.packingEntry.findMany({ where }),
  ]);

  const out: PricedEntry[] = [];
  const push = (e: any, section: PricedEntry["section"], label: string, rate: number) =>
    out.push({
      employeeId: e.employeeId,
      date: e.date,
      section,
      label,
      rate,
      dozenEquiv: qty(e.dozen, e.pieces),
    });

  for (const e of cutting)
    push(e, "cutting", `${e.cuttingLot.category.name}/${e.cuttingLot.size.name}`, rateFor.cutting(rates, e));
  for (const e of pouch) push(e, "pouch", e.cuttingLot.category.name, rateFor.pouch(rates, e));
  // When a type has slabs the size joins the label, so same-day entries at
  // different sizes land in different buckets (a bucket carries one rate).
  for (const e of stretching)
    push(
      e,
      "stretching",
      rates.stretching.hasSlabs(e.stretchingTypeId)
        ? `${e.stretchingType.name}/${e.cuttingLot.size.name}`
        : e.stretchingType.name,
      rateFor.stretching(rates, e)
    );
  for (const e of pichiru) push(e, "pichiru", "section.pichiru", rateFor.pichiru(rates));
  for (const e of packing) push(e, "packing", "section.packing", rateFor.packing(rates));
  return out;
}

/**
 * Priced entries → day-wise lines, bucketed by (date, section, label).
 *
 * The ONLY place gross is totalled. Rounding order is part of the contract:
 * dozens accumulate per bucket, the bucket is multiplied by its rate once, and
 * only then are amounts summed. Pricing per entry instead drifts by a few paise
 * against the payslip — which is what employees are shown and what gets frozen
 * into WeeklySalary — so both callers must come through here.
 */
function linesFrom(entries: PricedEntry[]): { lines: SalaryLine[]; grossTotal: number } {
  const buckets = new Map<string, SalaryLine>();
  for (const e of entries) {
    const key = `${e.date}|${e.section}|${e.label}`;
    const existing = buckets.get(key);
    if (existing) existing.dozen = round2(existing.dozen + e.dozenEquiv);
    else
      buckets.set(key, {
        date: e.date,
        section: e.section,
        label: e.label,
        dozen: round2(e.dozenEquiv),
        rate: e.rate,
        amount: 0,
      });
  }
  const lines = [...buckets.values()].map((l) => ({ ...l, amount: round2(l.dozen * l.rate) }));
  lines.sort((a, b) => a.date.localeCompare(b.date) || a.section.localeCompare(b.section));
  return { lines, grossTotal: round2(lines.reduce((s, l) => s + l.amount, 0)) };
}

/**
 * Day-wise salary lines for one employee in a week. Rates: cutting =
 * CuttingPrice[category,size], pouch = PouchPrice[category], stretching = type
 * size-range slab (fallback: type rate), pichiru/packing = flat settings.
 * Missing price → rate 0 (never NaN). Shared by the live preview and the saved
 * snapshot.
 */
async function computeLines(
  employeeId: number,
  weekStart: string,
  weekEnd: string,
  preloaded?: Rates
): Promise<{ lines: SalaryLine[]; grossTotal: number }> {
  const rates = preloaded ?? (await loadRates());
  return linesFrom(await pricedEntries({ employeeId, date: { gte: weekStart, lte: weekEnd } }, rates));
}

/** Compute gross for a week, branching on the employee's salary type. */
async function computeCore(
  employee: { id: number; salaryType: string; shiftRate: number },
  weekStart: string,
  weekEnd: string
): Promise<{
  salaryType: "piece" | "shift";
  shifts: number;
  shiftRate: number;
  lines: SalaryLine[];
  grossTotal: number;
}> {
  if (employee.salaryType === "shift") {
    const se = await prisma.shiftEntry.findUnique({
      where: { employeeId_weekStart: { employeeId: employee.id, weekStart } },
    });
    const shifts = round2(se?.shifts ?? 0);
    return {
      salaryType: "shift",
      shifts,
      shiftRate: employee.shiftRate,
      lines: [],
      grossTotal: round2(shifts * employee.shiftRate),
    };
  }
  const { lines, grossTotal } = await computeLines(employee.id, weekStart, weekEnd);
  return { salaryType: "piece", shifts: 0, shiftRate: 0, lines, grossTotal };
}

/** Overall advance balance = Σ advances − Σ all weekly deductions. */
async function advanceBalance(employeeId: number): Promise<number> {
  const [adv, ded] = await Promise.all([
    prisma.employeeAdvance.aggregate({ where: { employeeId }, _sum: { amount: true } }),
    prisma.weeklySalary.aggregate({ where: { employeeId }, _sum: { advanceDeducted: true } }),
  ]);
  return round2((adv._sum.amount ?? 0) - (ded._sum.advanceDeducted ?? 0));
}

/** Live weekly salary (fresh recompute) + any saved deduction pre-filled. */
export async function weeklySalary(
  employeeId: number,
  dateInWeek: string
): Promise<SalaryBreakdown> {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee) throw new ApiException(ErrorCode.EMPLOYEE_NOT_FOUND, 404);

  const weekStart = weekStartOf(dateInWeek);
  const weekEnd = weekEndOf(dateInWeek);
  const core = await computeCore(employee, weekStart, weekEnd);

  const saved = await prisma.weeklySalary.findUnique({
    where: { employeeId_weekStart: { employeeId, weekStart } },
  });
  const advanceDeducted = saved?.advanceDeducted ?? 0;

  return {
    employeeId,
    employeeName: employee.name,
    weekStart,
    weekEnd,
    ...core,
    advanceDeducted,
    netTotal: round2(core.grossTotal - advanceDeducted),
    advanceBalance: await advanceBalance(employeeId),
    saved: !!saved,
  };
}

/**
 * Payroll for one week across EVERY employee.
 *
 * Deliberately not a loop over `weeklySalary()`: that would re-load the rate
 * maps and run five entry queries per employee (~125 for this shop). Instead the
 * week's entries are read once for all employees and bucketed by employeeId, so
 * cost is flat in headcount. Rates go through the same `rateFor` helpers as the
 * per-employee payslip, so the two can't disagree.
 *
 * Row set = every active employee, PLUS any inactive one who worked this week or
 * already has a saved snapshot — deactivating someone mid-week must not quietly
 * drop them from payroll.
 */
export async function weekSalarySheet(dateInWeek: string): Promise<WeekSalarySheet> {
  const weekStart = weekStartOf(dateInWeek);
  const weekEnd = weekEndOf(dateInWeek);
  const range = { gte: weekStart, lte: weekEnd };
  const rates = await loadRates();

  const [entries, shifts, savedRows, advanceSums, deductionSums, employees] = await Promise.all([
    pricedEntries({ date: range }, rates),
    prisma.shiftEntry.findMany({ where: { weekStart } }),
    prisma.weeklySalary.findMany({ where: { weekStart } }),
    prisma.employeeAdvance.groupBy({ by: ["employeeId"], _sum: { amount: true } }),
    prisma.weeklySalary.groupBy({ by: ["employeeId"], _sum: { advanceDeducted: true } }),
    prisma.employee.findMany({ orderBy: { name: "asc" } }),
  ]);

  // Bucket per employee, then total through the SAME `linesFrom` the payslip
  // uses — otherwise rounding order diverges and the sheet disagrees with the
  // payslip by a few paise per employee.
  const byEmployee = new Map<number, PricedEntry[]>();
  for (const e of entries) {
    const list = byEmployee.get(e.employeeId);
    if (list) list.push(e);
    else byEmployee.set(e.employeeId, [e]);
  }
  const gross = new Map<number, number>();
  const dozen = new Map<number, number>();
  for (const [employeeId, list] of byEmployee) {
    const { lines, grossTotal } = linesFrom(list);
    gross.set(employeeId, grossTotal);
    dozen.set(employeeId, round2(lines.reduce((s, l) => s + l.dozen, 0)));
  }

  const shiftBy = new Map(shifts.map((s) => [s.employeeId, s.shifts]));
  const savedBy = new Map(savedRows.map((s) => [s.employeeId, s]));
  const advancedBy = new Map(advanceSums.map((a) => [a.employeeId, a._sum.amount ?? 0]));
  const deductedBy = new Map(deductionSums.map((d) => [d.employeeId, d._sum.advanceDeducted ?? 0]));

  const rows: WeekSalaryRow[] = [];
  for (const emp of employees) {
    const worked = gross.has(emp.id) || shiftBy.has(emp.id) || savedBy.has(emp.id);
    if (!emp.active && !worked) continue;

    const isShift = emp.salaryType === "shift";
    const shiftCount = round2(shiftBy.get(emp.id) ?? 0);
    const grossTotal = isShift
      ? round2(shiftCount * emp.shiftRate)
      : round2(gross.get(emp.id) ?? 0);
    const advanceDeducted = savedBy.get(emp.id)?.advanceDeducted ?? 0;

    rows.push({
      employeeId: emp.id,
      employeeName: emp.name,
      salaryType: isShift ? "shift" : "piece",
      shifts: isShift ? shiftCount : 0,
      shiftRate: isShift ? emp.shiftRate : 0,
      totalDozen: isShift ? 0 : round2(dozen.get(emp.id) ?? 0),
      grossTotal,
      advanceDeducted,
      netTotal: round2(grossTotal - advanceDeducted),
      advanceBalance: round2((advancedBy.get(emp.id) ?? 0) - (deductedBy.get(emp.id) ?? 0)),
      saved: savedBy.has(emp.id),
      active: emp.active,
    });
  }

  return {
    weekStart,
    weekEnd,
    rows,
    totals: {
      gross: round2(rows.reduce((s, r) => s + r.grossTotal, 0)),
      advanceDeducted: round2(rows.reduce((s, r) => s + r.advanceDeducted, 0)),
      net: round2(rows.reduce((s, r) => s + r.netTotal, 0)),
      employees: rows.filter((r) => r.grossTotal > 0).length,
    },
  };
}

/**
 * Save the week: persist a fresh snapshot + the advance deduction. Idempotent by
 * the unique (employeeId, weekStart) — `advanceDeducted` is stored ABSOLUTE, so
 * re-saving overwrites (never accumulates). Guard: the new deduction cannot
 * exceed the balance excluding this week's own prior deduction.
 */
export async function saveSalary(
  employeeId: number,
  dateInWeek: string,
  advanceDeducted: number
): Promise<SalaryBreakdown> {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee) throw new ApiException(ErrorCode.EMPLOYEE_NOT_FOUND, 404);

  const weekStart = weekStartOf(dateInWeek);
  const weekEnd = weekEndOf(dateInWeek);
  const core = await computeCore(employee, weekStart, weekEnd);
  const { lines, grossTotal } = core;

  await prisma.$transaction(async (tx) => {
    const totalAdvances = await tx.employeeAdvance.aggregate({
      where: { employeeId },
      _sum: { amount: true },
    });
    const otherDeductions = await tx.weeklySalary.aggregate({
      where: { employeeId, weekStart: { not: weekStart } },
      _sum: { advanceDeducted: true },
    });
    const available = round2(
      (totalAdvances._sum.amount ?? 0) - (otherDeductions._sum.advanceDeducted ?? 0)
    );
    if (advanceDeducted > available + 1e-9) {
      throw new ApiException(ErrorCode.ADVANCE_EXCEEDED, 400, { available });
    }

    await tx.weeklySalary.upsert({
      where: { employeeId_weekStart: { employeeId, weekStart } },
      create: {
        employeeId,
        weekStart,
        weekEnd,
        linesJson: JSON.stringify(lines),
        grossTotal,
        advanceDeducted,
        netTotal: round2(grossTotal - advanceDeducted),
      },
      update: {
        weekEnd,
        linesJson: JSON.stringify(lines),
        grossTotal,
        advanceDeducted,
        netTotal: round2(grossTotal - advanceDeducted),
      },
    });
  });

  return {
    employeeId,
    employeeName: employee.name,
    weekStart,
    weekEnd,
    ...core,
    advanceDeducted,
    netTotal: round2(grossTotal - advanceDeducted),
    advanceBalance: await advanceBalance(employeeId),
    saved: true,
  };
}
