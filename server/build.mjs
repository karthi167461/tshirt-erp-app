// Bundles the server to dist/index.js for the Windows service (plain `node`,
// no TS loader at boot). All node_modules stay external and load normally at
// runtime — this avoids breaking packages that use __dirname / dynamic require
// (e.g. node-cron, prisma). Only our own source and the @erp/shared workspace
// (which is TypeScript) get inlined.
import * as esbuild from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));

await esbuild.build({
  entryPoints: [path.join(dir, "src/index.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile: path.join(dir, "dist/index.js"),
  packages: "external",
  alias: {
    "@erp/shared": path.resolve(dir, "../shared/src/index.ts"),
  },
  banner: {
    js: "import{createRequire}from'module';const require=createRequire(import.meta.url);",
  },
  logLevel: "info",
});
