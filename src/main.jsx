import React from "react";
import { createRoot } from "react-dom/client";
import Vault from "./Vault.jsx";
import { ErrorBoundary } from "./components/ErrorBoundary.jsx";
import { reloadOnNewWorker, checkWhenForegrounded } from "./lib/fresh.js";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Vault />
    </ErrorBoundary>
  </React.StrictMode>
);

/* Registered after load so a failed service worker never delays first paint.
   Offline matters here: these visits happen in homes with poor signal. */
/* A copy built to be looked at rather than used: the worker precaches a fixed
   set of paths and would serve a stale shell from whatever address it is
   parked at, which is the one thing a preview must not do. */
const PREVIEW = import.meta.env.VITE_PREVIEW === "1";

if ("serviceWorker" in navigator && !PREVIEW) {
  /* Attached before registering: a worker already in control may hand over
     during registration, and that hand-over is the signal to reload. */
  reloadOnNewWorker();
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { updateViaCache: "none" })
      .then(() => checkWhenForegrounded())
      .catch(() => { /* offline support is a bonus, not a requirement */ });
  });
}
