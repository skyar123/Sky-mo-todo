/* Proves the board still opens with the network cut, which is the whole point
   of the service worker: these visits happen in homes with no signal.

   This caught a real bug. The preview server answers with "Vary: Origin", and
   a module script request carries an Origin header while the precaching
   request does not, so cache.match missed the bundle it had just stored and
   the page came back blank. Hence ignoreVary in sw.js. */

/* The board polls the shared endpoint, so the network never goes quiet.
   "networkidle" would be a coin toss here; every wait below is for the thing
   the next step actually needs. */
import { chromium } from "playwright";
import { loadFixture } from "./fixture.mjs";
import { LONG } from "../src/lib/dates.js";

const BASE = process.env.BASE || "http://localhost:4173";
const fx = await loadFixture();

const browser = await chromium.launch(
  process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}
);
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();

await page.goto(`${BASE}/?date=${fx.todayIso}`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("#passcode:not([disabled])");
await page.fill("#passcode", process.env.SKYMO_PASSCODE);
await page.click('button[type="submit"]');
await page.waitForSelector(`text=${LONG[fx.today.getDay()]}`, { timeout: 25000 });

const reg = await page.evaluate(async () => {
  const r = await navigator.serviceWorker.ready;
  return !!r.active;
});
console.log("  service worker:", reg ? "active" : "NOT ACTIVE");
if (!reg) process.exitCode = 1;

await page.waitForTimeout(1500);
const cached = await page.evaluate(async () => {
  const names = await caches.keys();
  const c = await caches.open(names[0]);
  return (await c.keys()).map((r) => new URL(r.url).pathname).sort();
});
console.log("  precached:", cached.join(" "));

console.log("  --- cutting the network ---");
await ctx.setOffline(true);
await page.reload({ waitUntil: "domcontentloaded" });
try {
  await page.waitForSelector(`text=${LONG[fx.today.getDay()]}`, { timeout: 20000 });
  const main = await page.textContent("main");
  const visitsShown = fx.todayVisits.every((v) => main.includes(v.name));
  console.log("  offline reload: board rendered." + (visitsShown ? " Visits present." : " VISITS MISSING"));
  if (!visitsShown) process.exitCode = 1;
} catch {
  console.log("  offline reload FAILED: board did not render");
  process.exitCode = 1;
}

await ctx.setOffline(false);

/* The escape hatch, for a phone that is somehow still on an old bundle. It
   throws away the worker and everything it cached, so the thing to prove is
   that it does not brick the app: the board comes back and so does offline. */
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForSelector(`text=${LONG[fx.today.getDay()]}`, { timeout: 25000 });
await page.click('button[aria-label="Backup and lock"]');
await page.waitForSelector('button[aria-label="Reload the latest version"]', { timeout: 8000 });
await page.click('button[aria-label="Reload the latest version"]');
await page.waitForTimeout(2500);
try {
  await page.waitForSelector(`text=${LONG[fx.today.getDay()]}`, { timeout: 25000 });
  console.log("  after starting again: board still opens");
} catch {
  console.log("  after starting again: BOARD DID NOT COME BACK");
  process.exitCode = 1;
}
const back = await page.evaluate(async () => {
  const r = await navigator.serviceWorker.ready;
  return !!r.active;
});
console.log("  offline support re-registered:", back ? "yes" : "NO");
if (!back) process.exitCode = 1;

await browser.close();
