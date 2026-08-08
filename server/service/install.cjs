/* Registers the ERP server as a Windows Service (auto-start on boot,
 * auto-restart on crash). Run via scripts/install-service.ps1.
 *
 * The service runs the COMPILED server (`node dist/index.js`) — plain Node, no
 * TypeScript loader at boot — so start-up is robust and unattended. The server
 * loads its .env and resolves the DB/backup paths by absolute path, so the
 * service's working directory does not matter. */
const path = require("node:path");
const fs = require("node:fs");
const { Service } = require("node-windows");

const serverDir = path.resolve(__dirname, "..");
const entry = path.join(serverDir, "dist", "index.js");

if (!fs.existsSync(entry)) {
  console.error(
    `Missing ${entry}. Run "npm run build --workspace=server" first ` +
      `(install-service.ps1 does this automatically).`
  );
  process.exit(1);
}

const svc = new Service({
  name: "CompanyERP",
  description:
    "Company ERP local network server (Cutting/Stretching/QC/Packing)",
  script: entry,
  env: [{ name: "NODE_ENV", value: "production" }],
});

svc.on("install", () => {
  console.log("CompanyERP service installed. Starting…");
  svc.start();
});
svc.on("alreadyinstalled", () =>
  console.log("CompanyERP service already installed.")
);
svc.on("start", () => console.log("CompanyERP service started."));
svc.on("error", (e) => console.error("Service error:", e));

svc.install();
