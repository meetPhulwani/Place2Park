import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
