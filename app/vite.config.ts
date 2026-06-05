import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

import { cloudflare } from "@cloudflare/vite-plugin";

// Hosted on Cloudflare Pages at the site root, so base is "/". Override
// via the BASE env var if hosting somewhere with a subpath.
const base = process.env.BASE ?? "/";

export default defineConfig({
  plugins: [react(), cloudflare()],
  base,
  server: { port: 5173 },
});