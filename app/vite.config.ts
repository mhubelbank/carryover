import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

import { cloudflare } from "@cloudflare/vite-plugin";

import pkg from "./package.json" with { type: "json" };

// Hosted on Cloudflare Pages at the site root, so base is "/". Override
// via the BASE env var if hosting somewhere with a subpath.
const base = process.env.BASE ?? "/";

export default defineConfig({
  plugins: [react(), cloudflare()],
  base,
  // Stamped into the build so crash reports record which version broke.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  server: { port: 5173 },
});