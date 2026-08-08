import { prisma, getSettings } from "./db.js";

async function main() {
  await getSettings();
  await prisma.settings.update({
    where: { id: 1 },
    data: {
      companyName: "என் நிறுவனம்",
      themeColor: "#4f46e5",
      cuttingPricePerDozen: 12,
      qcPricePerDozen: 6,
      packingPricePerDozen: 8,
      adminPin: "1234",
    },
  });

  const typeCount = await prisma.stretchingType.count();
  if (typeCount === 0) {
    await prisma.stretchingType.createMany({
      data: [
        { name: "நீள் ஸ்ட்ரெச்சிங்", amountPerDozen: 10 },
        { name: "குறுக்கு ஸ்ட்ரெச்சிங்", amountPerDozen: 8 },
        { name: "இரட்டை ஸ்ட்ரெச்சிங்", amountPerDozen: 14 },
      ],
    });
  }

  const empCount = await prisma.employee.count();
  if (empCount === 0) {
    await prisma.employee.createMany({
      data: [
        { name: "ராஜா", role: "cutting" },
        { name: "குமார்", role: "stretching" },
        { name: "மாலா", role: "qc" },
        { name: "செல்வி", role: "packing" },
      ],
    });
  }

  // Masters: categories (each with sizes) + colors.
  const catCount = await prisma.category.count();
  if (catCount === 0) {
    const demoCategories = [
      { name: "பனியன்", sizes: ["S", "M", "L", "XL"] },
      { name: "டிராயர்", sizes: ["70", "75", "80", "85"] },
    ];
    for (const c of demoCategories) {
      await prisma.category.create({
        data: {
          name: c.name,
          sizes: { create: c.sizes.map((name) => ({ name })) },
        },
      });
    }
  }

  const colorCount = await prisma.color.count();
  if (colorCount === 0) {
    await prisma.color.createMany({
      data: [
        { name: "வெள்ளை" },
        { name: "கருப்பு" },
        { name: "நீலம்" },
        { name: "சிவப்பு" },
      ],
    });
  }

  // A demo fabrication lot with two rolls (draft) for testing the flow.
  const fabCount = await prisma.fabricationLot.count();
  if (fabCount === 0) {
    await prisma.fabricationLot.create({
      data: {
        lotNumber: "FAB-1001",
        rolls: {
          create: [
            { dia: "30", rollCount: 5, weight: 12, texturePinnal: "P1" },
            { dia: "32", rollCount: 3, weight: 10, texturePinnal: "P2" },
          ],
        },
      },
    });
  }

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
