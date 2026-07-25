import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider, createBrowserRouter } from "react-router-dom";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import "./index.css";
import "./theme.css";
import { ThemeProvider } from "./components/theme/ThemeProvider";
import { isPerfEnabled } from "./lib/perfConfig";

const router = createBrowserRouter([{ path: "*", element: <App /> }]);
const isPublicFormRoute = window.location.pathname.startsWith("/forms/");

async function releasePublicFormFromPwaCache(): Promise<boolean> {
  if (!isPublicFormRoute || !("serviceWorker" in navigator)) return false;
  const reloadMarker = "assonam-public-form-sw-cleared";
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    const hasController = Boolean(navigator.serviceWorker.controller);
    if (!registrations.length && !hasController) return false;

    await Promise.all(registrations.map((registration) => registration.unregister()));
    if ("caches" in window) {
      const cacheNames = await window.caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name.startsWith("assonam-") || name.includes("workbox"))
          .map((name) => window.caches.delete(name)),
      );
    }
    if (sessionStorage.getItem(reloadMarker) !== "1") {
      sessionStorage.setItem(reloadMarker, "1");
      window.location.reload();
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

if (isPerfEnabled() && !(window as Window & { __perfInit?: boolean }).__perfInit) {
  (window as Window & { __perfInit?: boolean }).__perfInit = true;
  import("./lib/perf")
    .then(({ setupPerfInstrumentation }) => setupPerfInstrumentation())
    .catch(() => {});
}

if (import.meta.env.PROD && !isPublicFormRoute && "serviceWorker" in navigator) {
  const reloadForUpdatedServiceWorker = Boolean(navigator.serviceWorker.controller);
  let updateReloadStarted = false;
  if (reloadForUpdatedServiceWorker) {
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      () => {
        if (updateReloadStarted) return;
        if (document.documentElement.dataset.unsavedChanges === "true") return;
        updateReloadStarted = true;
        window.location.reload();
      },
      { once: true },
    );
  }
  registerSW({
    immediate: true,
    onRegisteredSW(
      _swUrl: string,
      registration: ServiceWorkerRegistration | undefined
    ) {
      registration?.update().catch(() => {});
    },
  });
}

releasePublicFormFromPwaCache().then((willReload) => {
  if (willReload) return;
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <ThemeProvider>
        <RouterProvider router={router} />
      </ThemeProvider>
    </React.StrictMode>
  );
});
