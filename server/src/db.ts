import "./env.js"; // ensure .env (DATABASE_URL) is loaded before the client
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

/** Ensures the single Settings row (id = 1) exists and returns it. */
export async function getSettings() {
  const existing = await prisma.settings.findUnique({ where: { id: 1 } });
  if (existing) return existing;
  return prisma.settings.create({ data: { id: 1 } });
}
