import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === "production" ? "/app/" : "/",
  esbuild: {
    drop: mode === "production" ? ["console", "debugger"] : [],
  },
}));

