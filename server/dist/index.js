import{createRequire}from'module';const require=createRequire(import.meta.url);

// src/index.ts
import { existsSync } from "node:fs";
import path3 from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";
import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import cron from "node-cron";

// ../shared/src/index.ts
import { z } from "zod";
var SECTIONS = ["cutting", "stretching", "qc", "packing"];
var ROLES = SECTIONS;
var ErrorCode = {
  LOT_NOT_FOUND: "error.lot_not_found",
  COLOR_NOT_FOUND: "error.color_not_found",
  NO_CUTTING_QUOTA: "error.no_cutting_quota",
  QUOTA_EXCEEDED: "error.quota_exceeded",
  EMPLOYEE_NOT_FOUND: "error.employee_not_found",
  STRETCHING_TYPE_NOT_FOUND: "error.stretching_type_not_found",
  DUPLICATE_LOT: "error.duplicate_lot",
  INVALID_PIN: "error.invalid_pin",
  VALIDATION: "error.validation",
  INTERNAL: "error.internal"
};
var id = z.coerce.number().int().positive();
var dozen = z.coerce.number().positive({ message: ErrorCode.VALIDATION });
var color = z.string().trim().min(1).max(60);
var lotNumber = z.string().trim().min(1).max(60);
var isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: ErrorCode.VALIDATION });
var employeeInput = z.object({
  name: z.string().trim().min(1).max(80),
  role: z.enum(ROLES),
  active: z.boolean().default(true)
});
var stretchingTypeInput = z.object({
  name: z.string().trim().min(1).max(80),
  amountPerDozen: z.coerce.number().nonnegative(),
  active: z.boolean().default(true)
});
var settingsInput = z.object({
  companyName: z.string().trim().min(1).max(120),
  themeColor: z.string().regex(/^#([0-9a-fA-F]{6})$/, { message: ErrorCode.VALIDATION }),
  cuttingPricePerDozen: z.coerce.number().nonnegative(),
  qcPricePerDozen: z.coerce.number().nonnegative(),
  packingPricePerDozen: z.coerce.number().nonnegative(),
  adminPin: z.string().trim().min(4).max(12).optional()
});
var cuttingEntryInput = z.object({
  lotNumber,
  color,
  dozen,
  employeeId: id,
  date: isoDate
});
var stretchingEntryInput = z.object({
  lotNumber,
  color,
  stretchingTypeId: id,
  dozen,
  employeeId: id,
  date: isoDate
});
var stageEntryInput = z.object({
  lotNumber,
  color,
  dozen,
  employeeId: id,
  date: isoDate
});
var pinInput = z.object({ pin: z.string().trim().min(1).max(12) });
function weekStartOf(dateIso) {
  const d = /* @__PURE__ */ new Date(`${dateIso}T00:00:00`);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return toIso(d);
}
function weekEndOf(dateIso) {
  const start = /* @__PURE__ */ new Date(`${weekStartOf(dateIso)}T00:00:00`);
  start.setDate(start.getDate() + 6);
  return toIso(start);
}
function toIso(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// src/env.ts
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
var here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../.env") });
var env = {
  port: Number(process.env.PORT ?? 4e3),
  host: process.env.HOST ?? "0.0.0.0",
  backupCron: process.env.BACKUP_CRON ?? "30 22 * * *",
  backupRetention: Number(process.env.BACKUP_RETENTION ?? 30),
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
  telegramChatId: process.env.TELEGRAM_CHAT_ID ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "file:./data/erp.db"
};

// src/db.ts
import { PrismaClient } from "@prisma/client";
var prisma = new PrismaClient();
async function getSettings() {
  const existing = await prisma.settings.findUnique({ where: { id: 1 } });
  if (existing) return existing;
  return prisma.settings.create({ data: { id: 1 } });
}

// src/errors.ts
var ApiException = class extends Error {
  code;
  statusCode;
  params;
  constructor(code, statusCode = 400, params) {
    super(code);
    this.code = code;
    this.statusCode = statusCode;
    this.params = params;
  }
};

// src/validate.ts
function parse(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new ApiException(ErrorCode.VALIDATION, 400, {
      field: first?.path.join(".") ?? "",
      detail: first?.message ?? ""
    });
  }
  return result.data;
}

// src/services/quota.ts
function checkQuota(quota, used, requested) {
  const remaining = round2(quota - used);
  const ok = requested <= remaining + 1e-9;
  return { ok, remaining, wouldBe: round2(used + requested) };
}
function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
async function cuttingQuota(lotId, color2) {
  const agg = await prisma.cuttingEntry.aggregate({
    where: { lotId, color: color2 },
    _sum: { dozen: true }
  });
  return round2(agg._sum.dozen ?? 0);
}
async function stretchingUsed(lotId, color2, stretchingTypeId) {
  const agg = await prisma.stretchingEntry.aggregate({
    where: { lotId, color: color2, stretchingTypeId },
    _sum: { dozen: true }
  });
  return round2(agg._sum.dozen ?? 0);
}
async function qcUsed(lotId, color2) {
  const agg = await prisma.qcEntry.aggregate({
    where: { lotId, color: color2 },
    _sum: { dozen: true }
  });
  return round2(agg._sum.dozen ?? 0);
}
async function packingUsed(lotId, color2) {
  const agg = await prisma.packingEntry.aggregate({
    where: { lotId, color: color2 },
    _sum: { dozen: true }
  });
  return round2(agg._sum.dozen ?? 0);
}
function assertWithinQuota(quota, used, requested) {
  if (quota <= 0) {
    throw new ApiException(ErrorCode.NO_CUTTING_QUOTA, 400);
  }
  const { ok, remaining } = checkQuota(quota, used, requested);
  if (!ok) {
    throw new ApiException(ErrorCode.QUOTA_EXCEEDED, 400, { remaining });
  }
}

// src/services/entries.ts
async function getOrCreateLot(lotNumber2) {
  const found = await prisma.lot.findUnique({ where: { lotNumber: lotNumber2 } });
  if (found) return found;
  return prisma.lot.create({ data: { lotNumber: lotNumber2 } });
}
async function getExistingLot(lotNumber2) {
  const lot = await prisma.lot.findUnique({ where: { lotNumber: lotNumber2 } });
  if (!lot) throw new ApiException(ErrorCode.LOT_NOT_FOUND, 404);
  return lot;
}
async function assertEmployee(employeeId) {
  const e = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!e) throw new ApiException(ErrorCode.EMPLOYEE_NOT_FOUND, 404);
}
async function createCutting(input) {
  await assertEmployee(input.employeeId);
  const lot = await getOrCreateLot(input.lotNumber);
  return prisma.cuttingEntry.create({
    data: {
      lotId: lot.id,
      color: input.color,
      dozen: input.dozen,
      employeeId: input.employeeId,
      date: input.date
    }
  });
}
async function createStretching(input) {
  await assertEmployee(input.employeeId);
  const lot = await getExistingLot(input.lotNumber);
  const type = await prisma.stretchingType.findUnique({
    where: { id: input.stretchingTypeId }
  });
  if (!type) throw new ApiException(ErrorCode.STRETCHING_TYPE_NOT_FOUND, 404);
  const quota = await cuttingQuota(lot.id, input.color);
  if (quota <= 0) throw new ApiException(ErrorCode.NO_CUTTING_QUOTA, 400);
  const used = await stretchingUsed(lot.id, input.color, input.stretchingTypeId);
  assertWithinQuota(quota, used, input.dozen);
  return prisma.stretchingEntry.create({
    data: {
      lotId: lot.id,
      color: input.color,
      stretchingTypeId: input.stretchingTypeId,
      dozen: input.dozen,
      employeeId: input.employeeId,
      date: input.date
    }
  });
}
async function createQc(input) {
  await assertEmployee(input.employeeId);
  const lot = await getExistingLot(input.lotNumber);
  const quota = await cuttingQuota(lot.id, input.color);
  const used = await qcUsed(lot.id, input.color);
  assertWithinQuota(quota, used, input.dozen);
  return prisma.qcEntry.create({
    data: {
      lotId: lot.id,
      color: input.color,
      dozen: input.dozen,
      employeeId: input.employeeId,
      date: input.date
    }
  });
}
async function createPacking(input) {
  await assertEmployee(input.employeeId);
  const lot = await getExistingLot(input.lotNumber);
  const quota = await cuttingQuota(lot.id, input.color);
  const used = await packingUsed(lot.id, input.color);
  assertWithinQuota(quota, used, input.dozen);
  return prisma.packingEntry.create({
    data: {
      lotId: lot.id,
      color: input.color,
      dozen: input.dozen,
      employeeId: input.employeeId,
      date: input.date
    }
  });
}
async function colorsForLot(lotNumber2) {
  const lot = await prisma.lot.findUnique({ where: { lotNumber: lotNumber2 } });
  if (!lot) return [];
  const rows = await prisma.cuttingEntry.findMany({
    where: { lotId: lot.id },
    distinct: ["color"],
    select: { color: true },
    orderBy: { color: "asc" }
  });
  return rows.map((r) => r.color);
}
async function quotaInfo(lotNumber2, color2, stage, stretchingTypeId) {
  const lot = await prisma.lot.findUnique({ where: { lotNumber: lotNumber2 } });
  if (!lot) throw new ApiException(ErrorCode.LOT_NOT_FOUND, 404);
  const quota = await cuttingQuota(lot.id, color2);
  let used = 0;
  if (stage === "stretching") {
    if (!stretchingTypeId)
      throw new ApiException(ErrorCode.STRETCHING_TYPE_NOT_FOUND, 400);
    used = await stretchingUsed(lot.id, color2, stretchingTypeId);
  } else if (stage === "qc") {
    used = await qcUsed(lot.id, color2);
  } else {
    used = await packingUsed(lot.id, color2);
  }
  return { lotNumber: lotNumber2, color: color2, quota, used, remaining: round2(quota - used) };
}

// src/services/analytics.ts
function percent(done, quota) {
  if (quota <= 0) return 0;
  return round2(Math.min(100, done / quota * 100));
}
async function lotAnalytics(lotNumber2) {
  const lot = await prisma.lot.findUnique({ where: { lotNumber: lotNumber2 } });
  if (!lot) throw new ApiException(ErrorCode.LOT_NOT_FOUND, 404);
  const cutting = await prisma.cuttingEntry.groupBy({
    by: ["color"],
    where: { lotId: lot.id },
    _sum: { dozen: true }
  });
  const types = await prisma.stretchingType.findMany({
    where: { active: true },
    orderBy: { id: "asc" }
  });
  const colors = [];
  for (const c of cutting) {
    const quota = round2(c._sum.dozen ?? 0);
    const stretching = [];
    for (const t of types) {
      const agg = await prisma.stretchingEntry.aggregate({
        where: { lotId: lot.id, color: c.color, stretchingTypeId: t.id },
        _sum: { dozen: true }
      });
      const done = round2(agg._sum.dozen ?? 0);
      stretching.push({
        typeId: t.id,
        typeName: t.name,
        done,
        percent: percent(done, quota)
      });
    }
    const qcAgg = await prisma.qcEntry.aggregate({
      where: { lotId: lot.id, color: c.color },
      _sum: { dozen: true }
    });
    const packAgg = await prisma.packingEntry.aggregate({
      where: { lotId: lot.id, color: c.color },
      _sum: { dozen: true }
    });
    const qcDone = round2(qcAgg._sum.dozen ?? 0);
    const packDone = round2(packAgg._sum.dozen ?? 0);
    colors.push({
      color: c.color,
      quota,
      stretching,
      qc: { done: qcDone, percent: percent(qcDone, quota) },
      packing: { done: packDone, percent: percent(packDone, quota) },
      completed: quota > 0 && packDone >= quota - 1e-9
    });
  }
  colors.sort((a, b) => a.color.localeCompare(b.color));
  return { lotNumber: lotNumber2, colors };
}
async function listLots() {
  return prisma.lot.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, lotNumber: true, createdAt: true }
  });
}

// src/services/salary.ts
async function weeklySalary(employeeId, dateInWeek) {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee) throw new ApiException(ErrorCode.EMPLOYEE_NOT_FOUND, 404);
  const weekStart = weekStartOf(dateInWeek);
  const weekEnd = weekEndOf(dateInWeek);
  const range = { gte: weekStart, lte: weekEnd };
  const settings = await getSettings();
  const lines = [];
  const cut = await prisma.cuttingEntry.aggregate({
    where: { employeeId, date: range },
    _sum: { dozen: true }
  });
  const cutDozen = round2(cut._sum.dozen ?? 0);
  if (cutDozen > 0) {
    lines.push({
      section: "cutting",
      label: "section.cutting",
      dozen: cutDozen,
      rate: settings.cuttingPricePerDozen,
      amount: round2(cutDozen * settings.cuttingPricePerDozen)
    });
  }
  const stretch = await prisma.stretchingEntry.groupBy({
    by: ["stretchingTypeId"],
    where: { employeeId, date: range },
    _sum: { dozen: true }
  });
  if (stretch.length) {
    const typeIds = stretch.map((s) => s.stretchingTypeId);
    const types = await prisma.stretchingType.findMany({
      where: { id: { in: typeIds } }
    });
    const typeMap = new Map(types.map((t) => [t.id, t]));
    for (const s of stretch) {
      const t = typeMap.get(s.stretchingTypeId);
      const dozen2 = round2(s._sum.dozen ?? 0);
      const rate = t?.amountPerDozen ?? 0;
      lines.push({
        section: "stretching",
        label: t?.name ?? "section.stretching",
        dozen: dozen2,
        rate,
        amount: round2(dozen2 * rate)
      });
    }
  }
  const qc = await prisma.qcEntry.aggregate({
    where: { employeeId, date: range },
    _sum: { dozen: true }
  });
  const qcDozen = round2(qc._sum.dozen ?? 0);
  if (qcDozen > 0) {
    lines.push({
      section: "qc",
      label: "section.qc",
      dozen: qcDozen,
      rate: settings.qcPricePerDozen,
      amount: round2(qcDozen * settings.qcPricePerDozen)
    });
  }
  const pack = await prisma.packingEntry.aggregate({
    where: { employeeId, date: range },
    _sum: { dozen: true }
  });
  const packDozen = round2(pack._sum.dozen ?? 0);
  if (packDozen > 0) {
    lines.push({
      section: "packing",
      label: "section.packing",
      dozen: packDozen,
      rate: settings.packingPricePerDozen,
      amount: round2(packDozen * settings.packingPricePerDozen)
    });
  }
  const total = round2(lines.reduce((sum, l) => sum + l.amount, 0));
  return {
    employeeId,
    employeeName: employee.name,
    weekStart,
    weekEnd,
    lines,
    total
  };
}

// src/services/backup.ts
import { createReadStream, createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path2 from "node:path";
import zlib from "node:zlib";
import { pipeline } from "node:stream/promises";
var TELEGRAM_LIMIT = 50 * 1024 * 1024;
var status = {
  lastRunAt: null,
  lastFile: null,
  lastSizeBytes: null,
  telegram: null,
  ok: null,
  error: null
};
function getBackupStatus() {
  return status;
}
async function dbFilePath() {
  const rows = await prisma.$queryRawUnsafe(
    "PRAGMA database_list;"
  );
  const main2 = rows.find((r) => r.name === "main") ?? rows[0];
  if (!main2?.file) throw new Error("Could not resolve SQLite file path");
  return main2.file;
}
async function backupDir() {
  return path2.join(path2.dirname(await dbFilePath()), "backups");
}
function stamp(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(
    d.getHours()
  )}${p(d.getMinutes())}`;
}
async function gzipFile(src, dest) {
  await pipeline(
    createReadStream(src),
    zlib.createGzip({ level: 9 }),
    createWriteStream(dest)
  );
}
async function pruneOld(dir) {
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".db.gz")).sort().reverse();
  for (const stale of files.slice(env.backupRetention)) {
    await fs.rm(path2.join(dir, stale), { force: true });
  }
}
async function sendToTelegram(filePath) {
  if (!env.telegramBotToken || !env.telegramChatId) return "skipped";
  const size = (await fs.stat(filePath)).size;
  if (size > TELEGRAM_LIMIT) {
    throw new Error(
      `Backup ${(size / 1048576).toFixed(1)}MB exceeds Telegram's 50MB bot limit`
    );
  }
  const buf = await fs.readFile(filePath);
  const form = new FormData();
  form.append("chat_id", env.telegramChatId);
  form.append(
    "document",
    new Blob([buf], { type: "application/gzip" }),
    path2.basename(filePath)
  );
  form.append("caption", `ERP backup ${path2.basename(filePath)}`);
  const res = await fetch(
    `https://api.telegram.org/bot${env.telegramBotToken}/sendDocument`,
    { method: "POST", body: form }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Telegram ${res.status}: ${text.slice(0, 200)}`);
  }
  return "sent";
}
async function runBackup() {
  const now = /* @__PURE__ */ new Date();
  try {
    const dir = await backupDir();
    await fs.mkdir(dir, { recursive: true });
    const raw = path2.join(dir, `erp-${stamp(now)}.db`);
    const gz = `${raw}.gz`;
    await prisma.$executeRawUnsafe(`VACUUM INTO '${raw.replace(/'/g, "''")}'`);
    await gzipFile(raw, gz);
    await fs.rm(raw, { force: true });
    await pruneOld(dir);
    const size = (await fs.stat(gz)).size;
    let telegram = null;
    let error = null;
    try {
      telegram = await sendToTelegram(gz);
    } catch (e) {
      telegram = "failed";
      error = e instanceof Error ? e.message : String(e);
    }
    status = {
      lastRunAt: now.toISOString(),
      lastFile: path2.basename(gz),
      lastSizeBytes: size,
      telegram,
      ok: telegram !== "failed",
      error
    };
  } catch (e) {
    status = {
      lastRunAt: now.toISOString(),
      lastFile: null,
      lastSizeBytes: null,
      telegram: null,
      ok: false,
      error: e instanceof Error ? e.message : String(e)
    };
  }
  return status;
}

// src/routes.ts
function publicSettings(s) {
  const { adminPin, ...rest } = s;
  return rest;
}
async function registerRoutes(app) {
  app.get("/api/health", async () => ({ ok: true }));
  app.get("/api/settings", async () => publicSettings(await getSettings()));
  app.put("/api/settings", async (req) => {
    const body = parse(settingsInput.partial(), req.body);
    await getSettings();
    const updated = await prisma.settings.update({ where: { id: 1 }, data: body });
    return publicSettings(updated);
  });
  app.post("/api/auth/verify-pin", async (req) => {
    const { pin } = parse(pinInput, req.body);
    const s = await getSettings();
    if (pin !== s.adminPin) throw new ApiException(ErrorCode.INVALID_PIN, 401);
    return { ok: true };
  });
  app.get("/api/employees", async (req) => {
    const activeOnly = req.query?.active === "1";
    return prisma.employee.findMany({
      where: activeOnly ? { active: true } : void 0,
      orderBy: { name: "asc" }
    });
  });
  app.post("/api/employees", async (req) => {
    const body = parse(employeeInput, req.body);
    return prisma.employee.create({ data: body });
  });
  app.put("/api/employees/:id", async (req) => {
    const id2 = Number(req.params.id);
    const body = parse(employeeInput.partial(), req.body);
    return prisma.employee.update({ where: { id: id2 }, data: body });
  });
  app.get("/api/stretching-types", async (req) => {
    const activeOnly = req.query?.active === "1";
    return prisma.stretchingType.findMany({
      where: activeOnly ? { active: true } : void 0,
      orderBy: { id: "asc" }
    });
  });
  app.post("/api/stretching-types", async (req) => {
    const body = parse(stretchingTypeInput, req.body);
    return prisma.stretchingType.create({ data: body });
  });
  app.put("/api/stretching-types/:id", async (req) => {
    const id2 = Number(req.params.id);
    const body = parse(stretchingTypeInput.partial(), req.body);
    return prisma.stretchingType.update({ where: { id: id2 }, data: body });
  });
  app.get("/api/lots", async () => listLots());
  app.get("/api/lots/:lotNumber/colors", async (req) => {
    const lotNumber2 = decodeURIComponent(req.params.lotNumber);
    return colorsForLot(lotNumber2);
  });
  app.get("/api/quota", async (req) => {
    const q = req.query;
    const stage = q.stage;
    return quotaInfo(
      String(q.lotNumber),
      String(q.color),
      stage,
      q.stretchingTypeId ? Number(q.stretchingTypeId) : void 0
    );
  });
  app.post("/api/cutting", async (req, reply) => {
    const body = parse(cuttingEntryInput, req.body);
    reply.code(201);
    return createCutting(body);
  });
  app.post("/api/stretching", async (req, reply) => {
    const body = parse(stretchingEntryInput, req.body);
    reply.code(201);
    return createStretching(body);
  });
  app.post("/api/qc", async (req, reply) => {
    const body = parse(stageEntryInput, req.body);
    reply.code(201);
    return createQc(body);
  });
  app.post("/api/packing", async (req, reply) => {
    const body = parse(stageEntryInput, req.body);
    reply.code(201);
    return createPacking(body);
  });
  app.get("/api/analytics/:lotNumber", async (req) => {
    const lotNumber2 = decodeURIComponent(req.params.lotNumber);
    return lotAnalytics(lotNumber2);
  });
  app.get("/api/salary", async (req) => {
    const q = req.query;
    return weeklySalary(Number(q.employeeId), String(q.date));
  });
  app.get("/api/backup/status", async () => getBackupStatus());
  app.post("/api/backup/run", async () => runBackup());
}

// src/index.ts
var __dirname = path3.dirname(fileURLToPath2(import.meta.url));
var webDist = path3.resolve(__dirname, "../../web/dist");
async function main() {
  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true });
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ApiException) {
      const body2 = {
        error: { code: err.code, params: err.params }
      };
      return reply.code(err.statusCode).send(body2);
    }
    app.log.error(err);
    const body = {
      error: {
        code: ErrorCode.INTERNAL,
        message: err instanceof Error ? err.message : String(err)
      }
    };
    return reply.code(500).send(body);
  });
  await registerRoutes(app);
  if (existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api")) {
        return reply.code(404).send({ error: { code: "error.not_found" } });
      }
      return reply.sendFile("index.html");
    });
  }
  await getSettings();
  if (cron.validate(env.backupCron)) {
    cron.schedule(env.backupCron, () => {
      app.log.info("Running scheduled backup");
      runBackup().then(
        (s) => app.log.info({ backup: s }, "Scheduled backup finished")
      );
    });
    app.log.info(`Backup scheduled: ${env.backupCron}`);
  } else {
    app.log.warn(`Invalid BACKUP_CRON "${env.backupCron}" \u2014 backups disabled`);
  }
  await app.listen({ port: env.port, host: env.host });
  app.log.info(`ERP server on http://${env.host}:${env.port}`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
