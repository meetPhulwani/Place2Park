import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

const consoleBuild = process.env.CONSOLE_BUILD === "1";

export default defineConfig({
  base: consoleBuild ? "/__console_base__/" : "/",
  plugins: [react(), tailwindcss()],
  build: {
    sourcemap: false,
    ...(consoleBuild
      ? {
          outDir: "dist-console",
          emptyOutDir: true,
          rollupOptions: { input: path.resolve(__dirname, "console.html") },
        }
      : {}),
  },
  // Tailwind runs via @tailwindcss/vite; empty inline PostCSS config stops
  // Vite from picking up the legacy root postcss.config.mjs.
  css: { postcss: { plugins: [] } },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:5000", changeOrigin: true },
      "/uploads": { target: "http://localhost:5000", changeOrigin: true },
      "/demo": { target: "http://localhost:5000", changeOrigin: true },
    },
  },
});
