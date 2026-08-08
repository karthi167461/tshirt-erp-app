import { ErrorCode } from "@erp/shared";
import { prisma } from "../db.js";
import { ApiException } from "../errors.js";
import { paginate } from "./pagination.js";
import { round2 } from "./quota.js";

/** Paginated employees with optional name/phone search. */
export function listEmployeesPaged(opts: {
  search?: string;
  page: number;
  pageSize: number;
}) {
  const where = opts.search
    ? {
        OR: [
          { name: { contains: opts.search } },
          { phone: { contains: opts.search } },
        ],
      }
    : {};
  return paginate(
    opts.page,
    opts.pageSize,
    () => prisma.employee.count({ where }),
    (skip, take) =>
      prisma.employee.findMany({
        where,
        orderBy: { name: "asc" },
        skip,
        take,
      })
  );
}

/**
 * Advance ledger for one employee: amounts GIVEN (EmployeeAdvance) and DEDUCTED
 * from salary (WeeklySalary.advanceDeducted). `month` (yyyy-mm) filters the shown
 * lists; the balance is the overall running total.
 */
export async function advanceLedger(employeeId: number, month?: string) {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee) throw new ApiException(ErrorCode.EMPLOYEE_NOT_FOUND, 404);

  const monthFilter = month ? { startsWith: month } : undefined;

  const given = await prisma.employeeAdvance.findMany({
    where: { employeeId, ...(monthFilter ? { date: monthFilter } : {}) },
    orderBy: [{ date: "desc" }, { id: "desc" }],
  });

  const deductedRows = await prisma.weeklySalary.findMany({
    where: {
      employeeId,
      advanceDeducted: { gt: 0 },
      ...(monthFilter ? { weekStart: monthFilter } : {}),
    },
    orderBy: { weekStart: "desc" },
    select: { id: true, weekStart: true, weekEnd: true, advanceDeducted: true },
  });

  // Overall running balance (all-time, ignores the month filter).
  const [allGiven, allDeducted] = await Promise.all([
    prisma.employeeAdvance.aggregate({ where: { employeeId }, _sum: { amount: true } }),
    prisma.weeklySalary.aggregate({ where: { employeeId }, _sum: { advanceDeducted: true } }),
  ]);

  const totalGivenAll = round2(allGiven._sum.amount ?? 0);
  const totalDeductedAll = round2(allDeducted._sum.advanceDeducted ?? 0);

  return {
    employee: { id: employee.id, name: employee.name },
    given: given.map((g) => ({ id: g.id, date: g.date, amount: g.amount, note: g.note })),
    deducted: deductedRows.map((d) => ({
      id: d.id,
      weekStart: d.weekStart,
      weekEnd: d.weekEnd,
      amount: d.advanceDeducted,
    })),
    periodGiven: round2(given.reduce((s, g) => s + g.amount, 0)),
    periodDeducted: round2(deductedRows.reduce((s, d) => s + d.advanceDeducted, 0)),
    totalGiven: totalGivenAll,
    totalDeducted: totalDeductedAll,
    balance: round2(totalGivenAll - totalDeductedAll),
  };
}
