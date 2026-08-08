import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  // Relative base so the built assets work when served by the local server
  // or wrapped by the Tauri desktop shell.
  base: "./",
  resolve: {
    alias: {
      "@": path.resolve(dir, "src"),
      "@erp/shared": path.resolve(dir, "../shared/src/index.ts"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:4000",
    },
  },
});
