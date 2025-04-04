import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src/renderer"),
    },
  },
  build: {
    outDir: ".vite/renderer",
  },
  root: path.join(__dirname, "src/renderer"),
  publicDir: path.join(__dirname, "public"),
  server: {
    port: 5173,
  },
});
