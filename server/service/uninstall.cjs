/* Removes the CompanyERP Windows Service. Run via scripts/uninstall-service.ps1. */
const path = require("node:path");
const { Service } = require("node-windows");

const serverDir = path.resolve(__dirname, "..");

const svc = new Service({
  name: "CompanyERP",
  script: path.join(serverDir, "src", "index.ts"),
});

svc.on("uninstall", () => console.log("CompanyERP service uninstalled."));
svc.on("error", (e) => console.error("Service error:", e));

svc.uninstall();
