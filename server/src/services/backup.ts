import { createReadStream, createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import { pipeline } from "node:stream/promises";
import { prisma, getSettings } from "../db.js";
import { env } from "../env.js";

const TELEGRAM_LIMIT = 50 * 1024 * 1024; // 50 MB bot upload cap

export interface BackupStatus {
  lastRunAt: string | null;
  lastFile: string | null;
  lastSizeBytes: number | null;
  telegram: "sent" | "skipped" | "failed" | null;
  ok: boolean | null;
  error: string | null;
}

let status: BackupStatus = {
  lastRunAt: null,
  lastFile: null,
  lastSizeBytes: null,
  telegram: null,
  ok: null,
  error: null,
};

export function getBackupStatus(): BackupStatus {
  return status;
}

/** Absolute path of the live SQLite file (asks SQLite itself, so it's always right). */
async function dbFilePath(): Promise<string> {
  const rows = await prisma.$queryRawUnsafe<{ file: string }[]>(
    "PRAGMA database_list;"
  );
  const main = rows.find((r: any) => r.name === "main") ?? rows[0];
  if (!main?.file) throw new Error("Could not resolve SQLite file path");
  return main.file;
}

/**
 * Backups live next to the SQLite file (…/data/backups). Anchoring to the DB's
 * own directory keeps the path identical whether the server runs from source
 * (tsx) or bundled (node dist/index.js) or as a Windows service.
 */
async function backupDir(): Promise<string> {
  return path.join(path.dirname(await dbFilePath()), "backups");
}

function stamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(
    d.getHours()
  )}${p(d.getMinutes())}`;
}

async function gzipFile(src: string, dest: string): Promise<void> {
  await pipeline(
    createReadStream(src),
    zlib.createGzip({ level: 9 }),
    createWriteStream(dest)
  );
}

async function pruneOld(dir: string): Promise<void> {
  const files = (await fs.readdir(dir))
    .filter((f) => f.endsWith(".db.gz"))
    .sort()
    .reverse();
  for (const stale of files.slice(env.backupRetention)) {
    await fs.rm(path.join(dir, stale), { force: true });
  }
}

async function sendToTelegram(
  filePath: string
): Promise<"sent" | "skipped" | "failed"> {
  // Credentials come from Settings (configurable in the app), with server/.env
  // as a fallback so backups keep working before Settings is populated.
  const settings = await getSettings();
  const botToken = settings.telegramBotToken || env.telegramBotToken;
  const chatId = settings.telegramChatId || env.telegramChatId;
  if (!botToken || !chatId) return "skipped";

  const size = (await fs.stat(filePath)).size;
  if (size > TELEGRAM_LIMIT) {
    throw new Error(
      `Backup ${(size / 1048576).toFixed(1)}MB exceeds Telegram's 50MB bot limit`
    );
  }

  const buf = await fs.readFile(filePath);
  const form = new FormData();
  form.append("chat_id", chatId);
  form.append(
    "document",
    new Blob([buf], { type: "application/gzip" }),
    path.basename(filePath)
  );
  form.append("caption", `ERP backup ${path.basename(filePath)}`);

  const res = await fetch(
    `https://api.telegram.org/bot${botToken}/sendDocument`,
    { method: "POST", body: form }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Telegram ${res.status}: ${text.slice(0, 200)}`);
  }
  return "sent";
}

/**
 * Full backup cycle: consistent SQLite snapshot (VACUUM INTO, no downtime) →
 * gzip → prune old → deliver to Telegram. Local backup is kept even if the
 * Telegram step fails.
 */
export async function runBackup(): Promise<BackupStatus> {
  const now = new Date();
  try {
    const dir = await backupDir();
    await fs.mkdir(dir, { recursive: true });
    const raw = path.join(dir, `erp-${stamp(now)}.db`);
    const gz = `${raw}.gz`;

    // VACUUM INTO makes a consistent copy while the app keeps running.
    await prisma.$executeRawUnsafe(`VACUUM INTO '${raw.replace(/'/g, "''")}'`);
    await gzipFile(raw, gz);
    await fs.rm(raw, { force: true });
    await pruneOld(dir);

    const size = (await fs.stat(gz)).size;
    let telegram: BackupStatus["telegram"] = null;
    let error: string | null = null;
    try {
      telegram = await sendToTelegram(gz);
    } catch (e) {
      telegram = "failed";
      error = e instanceof Error ? e.message : String(e);
    }

    status = {
      lastRunAt: now.toISOString(),
      lastFile: path.basename(gz),
      lastSizeBytes: size,
      telegram,
      ok: telegram !== "failed",
      error,
    };
  } catch (e) {
    status = {
      lastRunAt: now.toISOString(),
      lastFile: null,
      lastSizeBytes: null,
      telegram: null,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
  return status;
}
