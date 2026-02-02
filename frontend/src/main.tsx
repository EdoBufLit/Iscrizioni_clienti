import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
import { isPerfEnabled } from "./lib/perfConfig";

if (isPerfEnabled() && !(window as Window & { __perfInit?: boolean }).__perfInit) {
  (window as Window & { __perfInit?: boolean }).__perfInit = true;
  import("./lib/perf")
    .then(({ setupPerfInstrumentation }) => setupPerfInstrumentation())
    .catch(() => {});
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
