import React from "react";
import { createRoot } from "react-dom/client";
import Vault from "./Vault.jsx";
import { ErrorBoundary } from "./components/ErrorBoundary.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Vault />
    </ErrorBoundary>
  </React.StrictMode>
);

/* Registered after load so a failed service worker never delays first paint.
   Offline matters here: these visits happen in homes with poor signal. */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { updateViaCache: "none" })
      .catch(() => { /* offline support is a bonus, not a requirement */ });
  });
}
