import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

// Load server/.env by ABSOLUTE path (not cwd) so it works when launched as a
// Windows service, from source (tsx: …/server/src) or bundled (…/server/dist).
const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../.env") });

export const env = {
  port: Number(process.env.PORT ?? 4000),
  host: process.env.HOST ?? "0.0.0.0",
  backupCron: process.env.BACKUP_CRON ?? "30 22 * * *",
  backupRetention: Number(process.env.BACKUP_RETENTION ?? 30),
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
  telegramChatId: process.env.TELEGRAM_CHAT_ID ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "file:./data/erp.db",
};
