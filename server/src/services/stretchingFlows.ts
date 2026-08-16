import { ErrorCode, type StretchingFlowInput } from "@erp/shared";
import { prisma } from "../db.js";
import { ApiException } from "../errors.js";

/**
 * Stretching flows: a named, ordered sequence of stretching types a lot walks
 * through (step 1 bounded by pouch, step i by step i-1 — see quota.ts), plus a
 * per-flow choice of whether kainool applies afterwards.
 *
 * Editing a flow that lots already use is ALLOWED: quota is enforced at write
 * time only, so saved entries are never invalidated. Consequences to be aware
 * of: removing a step orphans its entries out of the chain (they still show in
 * analytics and still count for salary); adding a step drops the lot's
 * completed-stretching to that step's total (usually 0), which blocks NEW
 * kainool/packing entries until the step catches up; toggling skipKainool on a
 * flow whose lots already have kainool entries hides the stage but keeps the
 * entries (deletable for cleanup).
 */

const includeRefs = {
  steps: {
    orderBy: { position: "asc" as const },
    include: { stretchingType: { select: { id: true, name: true, amountPerDozen: true } } },
  },
  _count: { select: { cuttingLots: true } },
} as const;

function rethrowDuplicate(e: unknown): never {
  if (e && typeof e === "object" && (e as any).code === "P2002") {
    throw new ApiException(ErrorCode.DUPLICATE, 400);
  }
  throw e;
}

async function assertTypesExist(typeIds: number[]) {
  const found = await prisma.stretchingType.count({ where: { id: { in: typeIds } } });
  if (found !== typeIds.length)
    throw new ApiException(ErrorCode.STRETCHING_TYPE_NOT_FOUND, 404);
}

export function listStretchingFlows(activeOnly = false) {
  return prisma.stretchingFlow.findMany({
    where: activeOnly ? { active: true } : undefined,
    orderBy: { name: "asc" },
    include: includeRefs,
  });
}

export async function createStretchingFlow(input: StretchingFlowInput) {
  await assertTypesExist(input.steps);
  try {
    return await prisma.stretchingFlow.create({
      data: {
        name: input.name,
        skipKainool: input.skipKainool,
        active: input.active,
        steps: {
          create: input.steps.map((stretchingTypeId, i) => ({
            stretchingTypeId,
            position: i + 1,
          })),
        },
      },
      include: includeRefs,
    });
  } catch (e) {
    rethrowDuplicate(e);
  }
}

export async function updateStretchingFlow(id: number, input: Partial<StretchingFlowInput>) {
  const existing = await prisma.stretchingFlow.findUnique({ where: { id } });
  if (!existing) throw new ApiException(ErrorCode.STRETCHING_FLOW_NOT_FOUND, 404);
  if (input.steps) await assertTypesExist(input.steps);
  const update = prisma.stretchingFlow.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.skipKainool !== undefined ? { skipKainool: input.skipKainool } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
      ...(input.steps
        ? {
            steps: {
              create: input.steps.map((stretchingTypeId, i) => ({
                stretchingTypeId,
                position: i + 1,
              })),
            },
          }
        : {}),
    },
    include: includeRefs,
  });
  try {
    // Steps are replace-all (the price-slab pattern): delete + nested create in
    // one transaction so a failed update can never leave a half-edited order.
    if (!input.steps) return await update;
    const [, flow] = await prisma.$transaction([
      prisma.stretchingFlowStep.deleteMany({ where: { flowId: id } }),
      update,
    ]);
    return flow;
  } catch (e) {
    rethrowDuplicate(e);
  }
}

/** Delete a flow only if no cutting lot references it (steps cascade). */
export async function deleteStretchingFlow(id: number) {
  const existing = await prisma.stretchingFlow.findUnique({ where: { id } });
  if (!existing) throw new ApiException(ErrorCode.STRETCHING_FLOW_NOT_FOUND, 404);
  const used = await prisma.cuttingLot.count({ where: { stretchingFlowId: id } });
  if (used > 0) throw new ApiException(ErrorCode.IN_USE, 400);
  await prisma.stretchingFlow.delete({ where: { id } });
  return { deleted: true };
}
