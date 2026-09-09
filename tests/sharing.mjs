/* Two devices, one board.

   Two browser contexts means two separate local storages, which is as close as
   this gets to Skylar's phone and Mo's phone. The point is not that a tick
   travels, but that both people's work survives: the merge is per entry, so
   one person ticking something must never erase the other's.

   Runs against tests/api-stub.mjs, which implements the same contract as the
   deployed function. */

import { chromium } from "playwright";
import { loadFixture } from "./fixture.mjs";
import { LONG } from "../src/lib/dates.js";

const BASE = process.env.BASE || "http://localhost:4173";
const SETTLE = 6000; // debounced push, plus the other device's next pull

const fx = await loadFixture();
const day = LONG[fx.today.getDay()];
const fam = fx.withChild.name;

/* Printed as they happen: a later step depends on an earlier one, so knowing
   which one broke matters more than a tidy summary at the end. */
const ok = (m) => console.log("  ok   " + m);
const bad = (m) => { console.log("  FAIL " + m); process.exitCode = 1; };

/* Start from an empty shared board, or the earlier suites' ticks look like
   the other person's edits. */
await fetch(`${BASE}/api/board`, { method: "DELETE" });

const browser = await chromium.launch(
  process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}
);

async function openDevice(label, person) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => bad(`${label} page error: ${String(e).slice(0, 120)}`));
  if (process.env.SYNC_DEBUG) {
    page.on("response", async (r) => {
      if (!r.url().includes("/api/board")) return;
      let extra = "";
      if (r.request().method() === "PUT") {
        try {
          extra = " " + JSON.stringify(await r.json());
        } catch {
          extra = " (no body)";
        }
      }
      console.log(`    [${label}] ${r.request().method()} ${r.status()}${extra}`);
    });
    page.on("console", (m) => { if (m.type() === "error") console.log(`    [${label}] console: ${m.text().slice(0,160)}`); });
    page.on("requestfailed", (r) => {
      if (r.url().includes("/api/board")) console.log(`    [${label}] ${r.method()} FAILED ${r.failure()?.errorText}`);
    });
  }
  await page.goto(`${BASE}/?date=${fx.todayIso}`, { waitUntil: "networkidle" });
  await page.waitForSelector("#passcode:not([disabled])", { timeout: 20000 });
  await page.fill("#passcode", process.env.SKYMO_PASSCODE);
  await page.click('button[type="submit"]');
  await page.waitForSelector(`text=${day}`, { timeout: 30000 });

  /* The header lane chips also say "Mo", so the identity buttons are found by
     walking out from the prompt's own heading. */
  const pick = page
    .locator('div', { has: page.locator('div:text-is("Whose phone is this?")') })
    .last()
    .locator(`button:text-is("${person}")`);
  if (await pick.count()) await pick.first().click();
  else bad(`${label}: could not find the identity button for ${person}`);

  await page.waitForTimeout(SETTLE);
  return page;
}

const openFamily = async (page) => {
  await page.click('button:has-text("Families")');
  await page.waitForSelector("text=on the caseload");
  await page.click(`button:has-text("${fam}")`);
  await page.waitForSelector("text=Open tasks", { timeout: 10000 });
};

/* Reload, then give the board time to pull before believing what it shows. */
const refresh = async (page) => {
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(`text=${day}`, { timeout: 30000 });
  await page.waitForTimeout(SETTLE);
  await openFamily(page);
};

const checked = (page) => page.locator('main [role="checkbox"][aria-checked="true"]').count();

const A = await openDevice("A", "Skylar");
const B = await openDevice("B", "Mo");
ok("two independent devices unlocked the same board");

const aLabels = await A.locator("header button").allInnerTexts();
const bLabels = await B.locator("header button").allInnerTexts();
aLabels.includes("Me") && bLabels.includes("Me") && aLabels.includes("Mo") && bLabels.includes("Skylar")
  ? ok(`lane labels follow the device: A sees ${JSON.stringify(aLabels.slice(0, 3))}, B sees ${JSON.stringify(bLabels.slice(0, 3))}`)
  : bad(`lane labels wrong: A ${JSON.stringify(aLabels.slice(0, 3))} B ${JSON.stringify(bLabels.slice(0, 3))}`);

await openFamily(A);
await openFamily(B);

/* A ticks one task. B should see it. */
await A.locator('main [role="checkbox"]').first().click();
await A.waitForTimeout(SETTLE);
if (process.env.SYNC_DEBUG) {
  const st = await A.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => (x.getAttribute("aria-label") || "").startsWith("Sharing"));
    return b?.getAttribute("aria-label") || "no sync control";
  });
  const srv = await (await fetch(`${BASE}/api/board`)).json();
  console.log(`    [A] after tick: ${st} | server rev ${srv.rev}`);
}
await refresh(B);
const bSees = await checked(B);
bSees >= 1 ? ok(`B sees the task A ticked (${bSees} checked)`) : bad(`B did not see A's tick (${bSees} checked)`);

/* B ticks a different one. A must gain it without losing its own. */
await B.locator('main [role="checkbox"]').nth(2).click();
await B.waitForTimeout(SETTLE);
await refresh(A);
const aSees = await checked(A);
aSees >= 2 ? ok(`A has both ticks (${aSees} checked), neither was lost`) : bad(`A lost a tick (${aSees} checked, expected 2)`);

/* A adds a task. B should receive it. */
const phrase = `shared probe ${Date.now().toString().slice(-5)}`;
await A.fill('input[aria-label="Add a task to this family"]', phrase);
await A.locator('form button:text-is("Add")').click();
await A.waitForTimeout(SETTLE);
await refresh(B);
(await B.textContent("main")).includes(phrase)
  ? ok("B received the task A added")
  : bad("B did not receive A's new task");

/* B deletes it. It must not come back to A from A's own copy. */
await B.locator(`main button:has-text("${phrase}")`).first().click();
await B.waitForTimeout(400);
await B.locator('main button:text-is("delete")').first().click();
await B.waitForTimeout(SETTLE);
await refresh(A);
(await A.textContent("main")).includes(phrase)
  ? bad("the deleted task came back on A")
  : ok("a delete on one device sticks on the other");

await browser.close();
