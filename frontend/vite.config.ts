/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
type ManifestEntry = { file: string; isEntry?: boolean; imports?: string[]; css?: string[]; assets?: string[] };

/** Follow static imports only: installing the shell must not download every route. */
function precacheShellFiles(manifest: Record<string, ManifestEntry>): Set<string> {
  const files = new Set(["index.html", "manifest.webmanifest", "assonam-logo.svg", "logo-transparent.png",
    "apple-touch-icon.png", "assonam-pwa-192.png", "assonam-pwa-512.png", "assonam-pwa-maskable-512.png"]);
  const visited = new Set<string>();
  function visit(key: string) {
    if (visited.has(key)) return;
    visited.add(key);
    const entry = manifest[key];
    if (!entry) throw new Error(`Missing static manifest dependency: ${key}`);
    files.add(entry.file);
    entry.css?.forEach((file) => files.add(file));
    entry.assets?.forEach((file) => files.add(file));
    entry.imports?.forEach(visit);
  }
  Object.keys(manifest).filter((key) => manifest[key].isEntry).forEach(visit);
  return files;
}


let outputDirectory = "dist";

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    { name: "capture-precache-output", configResolved(config) { outputDirectory = config.build.outDir; } },
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: false,
      includeAssets: [
        "assonam-logo.svg",
        "logo-transparent.png",
        "apple-touch-icon.png",
        "assonam-pwa-192.png",
        "assonam-pwa-512.png",
        "assonam-pwa-maskable-512.png",
      ],
      manifest: {
        id: "/",
        name: "ASSONAM",
        short_name: "ASSONAM",
        description:
          "Portale associativo ASSONAM per iscrizioni, documenti, contabilita e gestione soci.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        theme_color: "#0f3d3a",
        background_color: "#f5f7f6",
        icons: [
          {
            src: "/assonam-pwa-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/assonam-pwa-512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/assonam-pwa-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        manifestTransforms: [async (entries) => {
          const manifest = JSON.parse(readFileSync(resolve(outputDirectory, ".vite/manifest.json"), "utf8"));
          const shell = precacheShellFiles(manifest);
          return { manifest: entries.filter((entry) => shell.has(entry.url.replace(/^\//, ""))), warnings: [] };
        }],
        navigateFallbackDenylist: [
          /^\/api(?:\/|$)/,
          /^\/member(?:\/|$)/,
          /^\/forms(?:\/|$)/,
          /^\/b(?:\/|$)/,
          /^\/health$/,
          /^\/version$/,
        ],
        runtimeCaching: [
          {
            urlPattern: /\/assets\/.*\.(?:css|js)$/i,
            handler: "CacheFirst",
            options: {
              cacheName: "assonam-static-assets",
              expiration: {
                maxEntries: 64,
                maxAgeSeconds: 60 * 60 * 24 * 7,
              },
            },
          },
          {
            urlPattern: /\.(?:png|svg|jpg|jpeg|webp|avif|woff2?|ttf)$/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "assonam-static-media",
              expiration: {
                maxEntries: 48,
                maxAgeSeconds: 60 * 60 * 24 * 14,
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  base: "/",
  build: { manifest: true },
  esbuild: {
    drop: mode === "production" ? ["console", "debugger"] : [],
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
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
