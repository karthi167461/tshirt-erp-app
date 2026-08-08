import type { FastifyInstance } from "fastify";
import {
  cuttingEntryInput,
  stretchingEntryInput,
  stageEntryInput,
  employeeInput,
  advanceInput,
  stretchingTypeInput,
  stretchingSlabsInput,
  settingsInput,
  pinInput,
  categoryInput,
  sizeInput,
  colorInput,
  diaSizeLinkInput,
  fabricationLotInput,
  fabricationRollInput,
  fabricationStage1Input,
  fabricationStage2Input,
  fabricationStatusInput,
  fabricationLockInput,
  cuttingLotInput,
  cuttingCompleteInput,
  entryEditInput,
  cuttingPriceInput,
  pouchPriceInput,
  salarySaveInput,
  shiftSaveInput,
  fabricationTypeInput,
  fabricationRenameInput,
  ripCuttingInput,
  ErrorCode,
} from "@erp/shared";
import { prisma, getSettings } from "./db.js";
import { parse } from "./validate.js";
import { ApiException } from "./errors.js";
import {
  createCutting,
  createPouch,
  createStretching,
  createPichiru,
  createPacking,
  colorsForCuttingLot,
  quotaInfo,
  lotColorQuotas,
  listEntries,
  updateEntry,
  deleteEntry,
  type StageName,
} from "./services/entries.js";
import { cuttingLotAnalytics, listCuttingLots, weekAnalytics } from "./services/analytics.js";
import { weeklySalary, saveSalary, weekSalarySheet } from "./services/salary.js";
import {
  listCuttingPrices,
  setCuttingPrice,
  listPouchPrices,
  setPouchPrice,
  setStretchingSlabs,
} from "./services/pricing.js";
import { runBackup, getBackupStatus } from "./services/backup.js";
import {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  listSizes,
  createSize,
  updateSize,
  deleteSize,
  listColors,
  createColor,
  updateColor,
  deleteColor,
  deleteStretchingType,
} from "./services/masters.js";
import {
  listDiaSizeLinks,
  createDiaSizeLink,
  updateDiaSizeLink,
  deleteDiaSizeLink,
} from "./services/diaSizeLinks.js";
import {
  listFabricationLotsPaged,
  listReadyLots,
  getFabricationLot,
  createFabricationLot,
  addRoll,
  updateRoll,
  deleteRoll,
  updateStage1,
  updateStage2,
  setStatus,
  setLock,
  setType,
  setName,
} from "./services/fabrication.js";
import { ripInfo, createRip, deleteRip, listRipLots } from "./services/rip.js";
import {
  createCuttingLot,
  listCuttingLotsPaged,
  listActiveCuttingLots,
  getCuttingLot,
  updateCuttingLot,
  deleteCuttingLot,
  setCuttingLotsCompleted,
} from "./services/cuttingLots.js";
import { listEmployeesPaged, advanceLedger } from "./services/employees.js";
import { listWeekShifts, saveWeekShifts } from "./services/shifts.js";
import { parsePageParams } from "./services/pagination.js";

/** Strip secrets before sending settings to clients; expose only a "configured" flag. */
function publicSettings(s: any) {
  const { adminPin, telegramBotToken, ...rest } = s;
  return { ...rest, telegramConfigured: !!telegramBotToken };
}

export async function registerRoutes(app: FastifyInstance) {
  app.get("/api/health", async () => ({ ok: true }));

  /* ---------------- Settings ---------------- */
  app.get("/api/settings", async () => publicSettings(await getSettings()));

  app.put("/api/settings", async (req) => {
    const body = parse(settingsInput.partial(), req.body);
    await getSettings(); // ensure row exists
    const updated = await prisma.settings.update({ where: { id: 1 }, data: body });
    return publicSettings(updated);
  });

  app.post("/api/auth/verify-pin", async (req) => {
    const { pin } = parse(pinInput, req.body);
    const s = await getSettings();
    if (pin !== s.adminPin) throw new ApiException(ErrorCode.INVALID_PIN, 401);
    return { ok: true };
  });

  /* ---------------- Employees ---------------- */
  app.get("/api/employees", async (req) => {
    const activeOnly = (req.query as any)?.active === "1";
    return prisma.employee.findMany({
      where: activeOnly ? { active: true } : undefined,
      orderBy: { name: "asc" },
    });
  });

  app.post("/api/employees", async (req) => {
    const body = parse(employeeInput, req.body);
    return prisma.employee.create({ data: body });
  });

  // Paginated employee list with name/phone search (for the Employees page).
  app.get("/api/employees/paged", async (req) => {
    const { page, pageSize, search } = parsePageParams(req.query);
    return listEmployeesPaged({ search, page, pageSize });
  });

  // Advance ledger (given + deducted, running balance) with optional ?month=yyyy-mm.
  app.get("/api/employees/:id/ledger", async (req) => {
    const employeeId = Number((req.params as any).id);
    const month = (req.query as any)?.month as string | undefined;
    return advanceLedger(employeeId, month || undefined);
  });

  app.put("/api/employees/:id", async (req) => {
    const id = Number((req.params as any).id);
    const body = parse(employeeInput.partial(), req.body);
    return prisma.employee.update({ where: { id }, data: body });
  });

  // Dated advance ledger per employee.
  app.get("/api/employees/:id/advances", async (req) => {
    const employeeId = Number((req.params as any).id);
    return prisma.employeeAdvance.findMany({
      where: { employeeId },
      orderBy: [{ date: "desc" }, { id: "desc" }],
    });
  });

  app.post("/api/employees/:id/advances", async (req, reply) => {
    const employeeId = Number((req.params as any).id);
    const emp = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!emp) throw new ApiException(ErrorCode.EMPLOYEE_NOT_FOUND, 404);
    const body = parse(advanceInput, req.body);
    reply.code(201);
    return prisma.employeeAdvance.create({ data: { employeeId, ...body } });
  });

  /* ---------------- Stretching types ---------------- */
  app.get("/api/stretching-types", async (req) => {
    const activeOnly = (req.query as any)?.active === "1";
    return prisma.stretchingType.findMany({
      where: activeOnly ? { active: true } : undefined,
      orderBy: { id: "asc" },
      include: { slabs: { orderBy: { minSize: "asc" } } },
    });
  });

  app.post("/api/stretching-types", async (req) => {
    const body = parse(stretchingTypeInput, req.body);
    return prisma.stretchingType.create({ data: body });
  });

  app.put("/api/stretching-types/:id", async (req) => {
    const id = Number((req.params as any).id);
    const body = parse(stretchingTypeInput.partial(), req.body);
    return prisma.stretchingType.update({ where: { id }, data: body });
  });

  app.put("/api/stretching-types/:id/slabs", async (req) => {
    const id = Number((req.params as any).id);
    const body = parse(stretchingSlabsInput, req.body);
    return setStretchingSlabs(id, body);
  });

  app.delete("/api/stretching-types/:id", async (req) =>
    deleteStretchingType(Number((req.params as any).id))
  );

  /* ---------------- Masters: categories / sizes / colors ---------------- */
  app.get("/api/categories", async (req) => {
    const activeOnly = (req.query as any)?.active === "1";
    return listCategories(activeOnly);
  });
  app.post("/api/categories", async (req, reply) => {
    const body = parse(categoryInput, req.body);
    reply.code(201);
    return createCategory(body);
  });
  app.put("/api/categories/:id", async (req) => {
    const id = Number((req.params as any).id);
    const body = parse(categoryInput.partial(), req.body);
    return updateCategory(id, body);
  });
  app.delete("/api/categories/:id", async (req) => deleteCategory(Number((req.params as any).id)));

  app.get("/api/sizes", async (req) => {
    const q = req.query as any;
    return listSizes(q?.categoryId ? Number(q.categoryId) : undefined, q?.active === "1");
  });
  app.post("/api/sizes", async (req, reply) => {
    const body = parse(sizeInput, req.body);
    reply.code(201);
    return createSize(body);
  });
  app.put("/api/sizes/:id", async (req) => {
    const id = Number((req.params as any).id);
    const body = parse(sizeInput.partial(), req.body);
    return updateSize(id, body);
  });
  app.delete("/api/sizes/:id", async (req) => deleteSize(Number((req.params as any).id)));

  app.get("/api/colors", async (req) => {
    const activeOnly = (req.query as any)?.active === "1";
    return listColors(activeOnly);
  });
  app.post("/api/colors", async (req, reply) => {
    const body = parse(colorInput, req.body);
    reply.code(201);
    return createColor(body);
  });
  app.put("/api/colors/:id", async (req) => {
    const id = Number((req.params as any).id);
    const body = parse(colorInput.partial(), req.body);
    return updateColor(id, body);
  });
  app.delete("/api/colors/:id", async (req) => deleteColor(Number((req.params as any).id)));

  /* ---------------- Dia → category/size links ---------------- */
  app.get("/api/dia-size-links", async () => listDiaSizeLinks());
  app.post("/api/dia-size-links", async (req, reply) => {
    const body = parse(diaSizeLinkInput, req.body);
    reply.code(201);
    return createDiaSizeLink(body);
  });
  app.put("/api/dia-size-links/:id", async (req) => {
    const id = Number((req.params as any).id);
    const body = parse(diaSizeLinkInput.partial(), req.body);
    return updateDiaSizeLink(id, body);
  });
  app.delete("/api/dia-size-links/:id", async (req) =>
    deleteDiaSizeLink(Number((req.params as any).id))
  );

  /* ---------------- Fabrication lots + rolls ---------------- */
  app.get("/api/fabrication-lots", async (req) => {
    const { page, pageSize, search } = parsePageParams(req.query);
    const status = (req.query as any)?.status as string | undefined;
    return listFabricationLotsPaged({ search, status, page, pageSize });
  });
  // Unpaginated ready lots — feeds the cutting-lot creation picker.
  app.get("/api/fabrication-lots/ready", async () => listReadyLots());
  app.get("/api/fabrication-lots/:id", async (req) => {
    return getFabricationLot(Number((req.params as any).id));
  });
  app.post("/api/fabrication-lots", async (req, reply) => {
    const body = parse(fabricationLotInput, req.body);
    reply.code(201);
    return createFabricationLot(body);
  });
  app.post("/api/fabrication-lots/:id/rolls", async (req, reply) => {
    const id = Number((req.params as any).id);
    const body = parse(fabricationRollInput, req.body);
    reply.code(201);
    return addRoll(id, body);
  });
  app.put("/api/fabrication-lots/:id/status", async (req) => {
    const id = Number((req.params as any).id);
    const body = parse(fabricationStatusInput, req.body);
    return setStatus(id, body);
  });
  app.put("/api/fabrication-lots/:id/lock", async (req) => {
    const id = Number((req.params as any).id);
    const body = parse(fabricationLockInput, req.body);
    return setLock(id, body);
  });
  app.put("/api/fabrication-lots/:id/type", async (req) => {
    const id = Number((req.params as any).id);
    const body = parse(fabricationTypeInput, req.body);
    return setType(id, body);
  });
  app.put("/api/fabrication-lots/:id/name", async (req) => {
    const id = Number((req.params as any).id);
    const body = parse(fabricationRenameInput, req.body);
    return setName(id, body);
  });
  app.put("/api/rolls/:rollId/stage1", async (req) => {
    const rollId = Number((req.params as any).rollId);
    const body = parse(fabricationStage1Input, req.body);
    return updateStage1(rollId, body);
  });
  app.put("/api/rolls/:rollId/stage2", async (req) => {
    const rollId = Number((req.params as any).rollId);
    const body = parse(fabricationStage2Input, req.body);
    return updateStage2(rollId, body);
  });
  // Edit / delete a roll's created fields (blocked when the lot is locked).
  app.put("/api/rolls/:rollId", async (req) => {
    const rollId = Number((req.params as any).rollId);
    const body = parse(fabricationRollInput.partial(), req.body);
    return updateRoll(rollId, body);
  });
  app.delete("/api/rolls/:rollId", async (req) => {
    const rollId = Number((req.params as any).rollId);
    return deleteRoll(rollId);
  });

  /* ---------------- Cutting lots ---------------- */
  app.get("/api/cutting-lots", async (req) => {
    const { page, pageSize, search } = parsePageParams(req.query);
    const status = (req.query as any)?.status as string | undefined;
    return listCuttingLotsPaged({ search, status, page, pageSize });
  });
  // Unpaginated active lots — feeds the downstream stage pickers.
  app.get("/api/cutting-lots/active", async () => listActiveCuttingLots());
  app.post("/api/cutting-lots", async (req, reply) => {
    const body = parse(cuttingLotInput, req.body);
    reply.code(201);
    return createCuttingLot(body);
  });
  app.post("/api/cutting-lots/complete", async (req) => {
    const body = parse(cuttingCompleteInput, req.body);
    return setCuttingLotsCompleted(body.cuttingLotIds, body.completed);
  });
  app.get("/api/cutting-lots/:id", async (req) => {
    return getCuttingLot(Number((req.params as any).id));
  });
  app.put("/api/cutting-lots/:id", async (req) => {
    const id = Number((req.params as any).id);
    const body = parse(cuttingLotInput.partial(), req.body);
    return updateCuttingLot(id, body);
  });
  app.delete("/api/cutting-lots/:id", async (req) => {
    return deleteCuttingLot(Number((req.params as any).id));
  });
  app.get("/api/cutting-lots/:id/colors", async (req) => {
    return colorsForCuttingLot(Number((req.params as any).id));
  });

  app.get("/api/quota", async (req) => {
    const q = req.query as any;
    const stage = q.stage as "pouch" | "stretching" | "pichiru" | "packing";
    return quotaInfo(
      Number(q.cuttingLotId),
      String(q.color),
      stage,
      q.stretchingTypeId ? Number(q.stretchingTypeId) : undefined
    );
  });

  /** Every colour of a lot at one stage, in a single call. */
  app.get("/api/quota/lot", async (req) => {
    const q = req.query as any;
    return lotColorQuotas(
      Number(q.cuttingLotId),
      q.stage as StageName,
      q.stretchingTypeId ? Number(q.stretchingTypeId) : undefined
    );
  });

  /* ---------------- Work entries ---------------- */
  app.post("/api/cutting", async (req, reply) => {
    const body = parse(cuttingEntryInput, req.body);
    reply.code(201);
    return createCutting(body);
  });

  app.post("/api/pouch", async (req, reply) => {
    const body = parse(stageEntryInput, req.body);
    reply.code(201);
    return createPouch(body);
  });

  app.post("/api/stretching", async (req, reply) => {
    const body = parse(stretchingEntryInput, req.body);
    reply.code(201);
    return createStretching(body);
  });

  app.post("/api/pichiru", async (req, reply) => {
    const body = parse(stageEntryInput, req.body);
    reply.code(201);
    return createPichiru(body);
  });

  app.post("/api/packing", async (req, reply) => {
    const body = parse(stageEntryInput, req.body);
    reply.code(201);
    return createPacking(body);
  });

  /* ---------------- Entry log: list / edit / delete per stage ---------------- */
  const STAGES: StageName[] = ["cutting", "pouch", "stretching", "pichiru", "packing"];
  for (const stage of STAGES) {
    app.get(`/api/${stage}`, async (req) => {
      const cuttingLotId = Number((req.query as any)?.cuttingLotId);
      if (!cuttingLotId) return [];
      return listEntries(stage, cuttingLotId);
    });
    app.put(`/api/${stage}/:id`, async (req) => {
      const id = Number((req.params as any).id);
      const body = parse(entryEditInput, req.body);
      return updateEntry(stage, id, body);
    });
    app.delete(`/api/${stage}/:id`, async (req) => {
      const id = Number((req.params as any).id);
      return deleteEntry(stage, id);
    });
  }

  /* ---------------- Rip cutting ---------------- */
  // Fabrication lots that have a 12-dia (rip material) roll — for the picker.
  app.get("/api/rip/lots", async () => listRipLots());
  // Ledger (material / used / remaining + entries) for one fabrication lot.
  app.get("/api/rip", async (req) => {
    const fabricationLotId = Number((req.query as any)?.fabricationLotId);
    if (!fabricationLotId) throw new ApiException(ErrorCode.FABRICATION_LOT_NOT_FOUND, 404);
    return ripInfo(fabricationLotId);
  });
  app.post("/api/rip", async (req, reply) => {
    const body = parse(ripCuttingInput, req.body);
    reply.code(201);
    return createRip(body);
  });
  app.delete("/api/rip/:id", async (req) => deleteRip(Number((req.params as any).id)));

  /* ---------------- Reports ---------------- */
  app.get("/api/cutting-lots-analytics", async () => listCuttingLots());
  app.get("/api/analytics/cutting-lot/:id", async (req) => {
    return cuttingLotAnalytics(Number((req.params as any).id));
  });

  app.get("/api/analytics/week", async (req) => {
    return weekAnalytics(String((req.query as any).date));
  });

  /** Payroll for a whole week, every employee. */
  app.get("/api/salary/week", async (req) => {
    const q = req.query as any;
    return weekSalarySheet(String(q.date ?? ""));
  });

  app.get("/api/salary", async (req) => {
    const q = req.query as any;
    return weeklySalary(Number(q.employeeId), String(q.date));
  });

  app.post("/api/salary", async (req) => {
    const body = parse(salarySaveInput, req.body);
    return saveSalary(body.employeeId, body.date, body.advanceDeducted);
  });

  /* ---------------- Weekly shift entry ---------------- */
  app.get("/api/shifts", async (req) => {
    return listWeekShifts(String((req.query as any).date));
  });
  app.post("/api/shifts", async (req) => {
    const body = parse(shiftSaveInput, req.body);
    return saveWeekShifts(body.date, body.entries);
  });

  /* ---------------- Pricing ---------------- */
  app.get("/api/prices/cutting", async () => listCuttingPrices());
  app.put("/api/prices/cutting", async (req) => setCuttingPrice(parse(cuttingPriceInput, req.body)));
  app.get("/api/prices/pouch", async () => listPouchPrices());
  app.put("/api/prices/pouch", async (req) => setPouchPrice(parse(pouchPriceInput, req.body)));

  /* ---------------- Backups ---------------- */
  app.get("/api/backup/status", async () => getBackupStatus());
  app.post("/api/backup/run", async () => runBackup());
}
