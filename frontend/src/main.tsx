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

if (isPerfEnabled() && !(window as Window & { __perfInit?: boolean }).__perfInit) {
  (window as Window & { __perfInit?: boolean }).__perfInit = true;
  import("./lib/perf")
    .then(({ setupPerfInstrumentation }) => setupPerfInstrumentation())
    .catch(() => {});
}

if (import.meta.env.PROD && "serviceWorker" in navigator) {
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

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>
  </React.StrictMode>
);
