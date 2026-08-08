import { weekStartOf } from "@erp/shared";
import { prisma } from "../db.js";
import { round2 } from "./quota.js";

/** Active shift-type employees for a week, with their saved shift count (0 if none). */
export async function listWeekShifts(dateInWeek: string) {
  const weekStart = weekStartOf(dateInWeek);
  const employees = await prisma.employee.findMany({
    where: { active: true, salaryType: "shift" },
    orderBy: { name: "asc" },
    select: { id: true, name: true, shiftRate: true },
  });
  const entries = await prisma.shiftEntry.findMany({
    where: { weekStart, employeeId: { in: employees.map((e) => e.id) } },
  });
  const byEmp = new Map(entries.map((e) => [e.employeeId, e.shifts]));
  return {
    weekStart,
    employees: employees.map((e) => ({
      employeeId: e.id,
      name: e.name,
      shiftRate: e.shiftRate,
      shifts: round2(byEmp.get(e.id) ?? 0),
    })),
  };
}

/** Bulk upsert a week's shift counts. */
export async function saveWeekShifts(
  dateInWeek: string,
  entries: { employeeId: number; shifts: number }[]
) {
  const weekStart = weekStartOf(dateInWeek);
  await prisma.$transaction(
    entries.map((e) =>
      prisma.shiftEntry.upsert({
        where: { employeeId_weekStart: { employeeId: e.employeeId, weekStart } },
        create: { employeeId: e.employeeId, weekStart, shifts: e.shifts },
        update: { shifts: e.shifts },
      })
    )
  );
  return { saved: entries.length };
}
