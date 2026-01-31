import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === "production" ? "/app/" : "/",
  esbuild: {
    drop: mode === "production" ? ["console", "debugger"] : [],
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "/member": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "/health": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "/version": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
}));
