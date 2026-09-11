/* Staying current.

   A service worker that updates itself is not the same as a page that is
   running the new code. The worker installs, claims the page, and the tab
   carries on executing the JavaScript it loaded minutes or days ago. On a
   phone that is opened from the home screen and never really navigated, that
   old bundle can survive several deploys, which is how a dead Google client id
   outlived two releases of the fix for it.

   So: ask for an update whenever the app comes to the front, and when a new
   worker takes over, reload once so the page is actually running it. */

let reloading = false;

/** The build this page is running, read from the script tag that booted it. */
export function runningBuild() {
  try {
    const src = document.querySelector('script[type="module"][src]')?.getAttribute("src") || "";
    return /index-([A-Za-z0-9_-]+)\.js/.exec(src)?.[1] || "dev";
  } catch {
    return "unknown";
  }
}

/** Ask the browser to re-check sw.js. Goes to the network, never through the
    worker's own fetch handler, so a stale cache cannot hide a new release. */
export async function checkForUpdate() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration?.();
    await reg?.update();
  } catch {
    /* offline, or no worker yet; the next foreground will try again */
  }
}

/**
 * Reload when a new worker takes control.
 *
 * Only when one was already in control: the very first install claims the page
 * too, and reloading then would refresh every first visit for nothing.
 */
export function reloadOnNewWorker() {
  if (!("serviceWorker" in navigator) || !navigator.serviceWorker.controller) return;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });
}

/** Check on every return to the app, which on a phone is the only "reload". */
export function checkWhenForegrounded() {
  const check = () => { if (document.visibilityState === "visible") checkForUpdate(); };
  document.addEventListener("visibilitychange", check);
  window.addEventListener("focus", check);
  checkForUpdate();
}

/**
 * The escape hatch. Drops the worker and everything it cached, then reloads.
 * Offline support comes back on the next load, when the page registers again.
 */
export async function startAgain() {
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations?.()) || [];
    await Promise.all(regs.map((r) => r.unregister()));
  } catch {
    /* nothing registered */
  }
  try {
    if (window.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    /* nothing cached */
  }
  window.location.reload();
}
