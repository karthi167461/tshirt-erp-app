/**
 * Clears all lot/production data: fabrication lots + rolls + rip cutting,
 * cutting lots, and every work entry hanging off them (cutting, pouch,
 * stretching, pichiru, packing).
 *
 * KEEPS masters and people: employees, settings, categories, sizes, colors,
 * dia links, stretching types + price slabs, cutting/pouch prices, shift
 * entries, advances and saved weekly salaries.
 *
 * Run: npm run purge:lots --workspace=server
 */
import { prisma } from "../db.js";

async function counts() {
  const [
    fabricationLot,
    fabricationRoll,
    ripCuttingEntry,
    cuttingLot,
    cuttingEntry,
    pouchEntry,
    stretchingEntry,
    pichiruEntry,
    packingEntry,
  ] = await Promise.all([
    prisma.fabricationLot.count(),
    prisma.fabricationRoll.count(),
    prisma.ripCuttingEntry.count(),
    prisma.cuttingLot.count(),
    prisma.cuttingEntry.count(),
    prisma.pouchEntry.count(),
    prisma.stretchingEntry.count(),
    prisma.pichiruEntry.count(),
    prisma.packingEntry.count(),
  ]);
  return {
    fabricationLot,
    fabricationRoll,
    ripCuttingEntry,
    cuttingLot,
    cuttingEntry,
    pouchEntry,
    stretchingEntry,
    pichiruEntry,
    packingEntry,
  };
}

async function main() {
  const before = await counts();
  console.log("Before:", before);

  // Children first, then the lots they belong to.
  await prisma.$transaction([
    prisma.cuttingEntry.deleteMany(),
    prisma.pouchEntry.deleteMany(),
    prisma.stretchingEntry.deleteMany(),
    prisma.pichiruEntry.deleteMany(),
    prisma.packingEntry.deleteMany(),
    prisma.cuttingLot.deleteMany(),
    prisma.ripCuttingEntry.deleteMany(),
    prisma.fabricationRoll.deleteMany(),
    prisma.fabricationLot.deleteMany(),
  ]);

  const after = await counts();
  console.log("After: ", after);

  const kept = {
    employees: await prisma.employee.count(),
    categories: await prisma.category.count(),
    sizes: await prisma.size.count(),
    colors: await prisma.color.count(),
    stretchingTypes: await prisma.stretchingType.count(),
    weeklySalaries: await prisma.weeklySalary.count(),
  };
  console.log("Kept:  ", kept);
  console.log("Purge complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
