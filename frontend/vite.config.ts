import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
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
        theme_color: "#0f2326",
        background_color: "#fdfcf9",
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
        navigateFallbackDenylist: [/^\/api(?:\/|$)/, /^\/member(?:\/|$)/, /^\/health$/, /^\/version$/],
        runtimeCaching: [
          {
            urlPattern: /\/assets\/.*\.(?:css|js)$/i,
            handler: "StaleWhileRevalidate",
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
