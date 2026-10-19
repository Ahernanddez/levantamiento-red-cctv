import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // En GitHub Pages (sitio de proyecto) la app vive bajo /<repo>/; se pasa
  // con PAGES_BASE=/<repo>/ solo para esa compilación. El resto (Cloudflare,
  // desarrollo) sigue en raíz.
  base: process.env.PAGES_BASE ?? "/",
  server: {
    host: "127.0.0.1",
    port: 5183,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
