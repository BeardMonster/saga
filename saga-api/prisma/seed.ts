import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.user.findFirst();
  if (!existing) {
    const user = await prisma.user.create({
      data: {
        email: "lostlegend@gmail.com",
        name: "Brandon",
      },
    });
    console.log(`Seeded user: ${user.email}`);
  } else {
    console.log(`User already seeded: ${existing.email}`);
  }

  await seedStarterCategories();
}

// A small starting taxonomy so the Finance page isn't a blank category
// picker on day one. Also the same taxonomy Phase 5's grocery deal
// cross-referencing will reuse — see DATA-MODEL.md.
async function seedStarterCategories() {
  const existingCount = await prisma.category.count();
  if (existingCount > 0) {
    console.log(`Categories already seeded (${existingCount})`);
    return;
  }

  const starter: Record<string, string[]> = {
    Food: ["Groceries", "Dining Out"],
    Housing: ["Rent/Mortgage", "Utilities"],
    Transportation: ["Gas", "Auto Maintenance"],
    Subscriptions: [],
    Income: [],
    Other: [],
  };

  for (const [parentName, children] of Object.entries(starter)) {
    const parent = await prisma.category.create({ data: { name: parentName } });
    for (const childName of children) {
      await prisma.category.create({ data: { name: childName, parentCategoryId: parent.id } });
    }
  }

  console.log("Seeded starter category taxonomy");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
