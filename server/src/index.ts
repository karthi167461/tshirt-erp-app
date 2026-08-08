import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import cron from "node-cron";
import { ErrorCode, type ApiError } from "@erp/shared";
import { env } from "./env.js";
import { registerRoutes } from "./routes.js";
import { ApiException } from "./errors.js";
import { runBackup } from "./services/backup.js";
import { getSettings } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// web build output: <repo>/web/dist
const webDist = path.resolve(__dirname, "../../web/dist");

async function main() {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });

  // Uniform error shape: { error: { code, params } } — client translates `code`.
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ApiException) {
      const body: { error: ApiError } = {
        error: { code: err.code, params: err.params },
      };
      return reply.code(err.statusCode).send(body);
    }
    app.log.error(err);
    const body: { error: ApiError } = {
      error: {
        code: ErrorCode.INTERNAL,
        message: err instanceof Error ? err.message : String(err),
      },
    };
    return reply.code(500).send(body);
  });

  await registerRoutes(app);

  // Serve the built web app (if present) with SPA fallback.
  if (existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api")) {
        return reply.code(404).send({ error: { code: "error.not_found" } });
      }
      return reply.sendFile("index.html");
    });
  }

  await getSettings(); // make sure the settings row exists on first boot

  // Daily backup cron.
  if (cron.validate(env.backupCron)) {
    cron.schedule(env.backupCron, () => {
      app.log.info("Running scheduled backup");
      runBackup().then((s) =>
        app.log.info({ backup: s }, "Scheduled backup finished")
      );
    });
    app.log.info(`Backup scheduled: ${env.backupCron}`);
  } else {
    app.log.warn(`Invalid BACKUP_CRON "${env.backupCron}" — backups disabled`);
  }

  await app.listen({ port: env.port, host: env.host });
  app.log.info(`ERP server on http://${env.host}:${env.port}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
