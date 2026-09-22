/* Two devices, one board.

   Two browser contexts means two separate local storages, which is as close as
   this gets to Skylar's phone and Mo's phone. The point is not that a tick
   travels, but that both people's work survives: the merge is per entry, so
   one person ticking something must never erase the other's.

   Runs against tests/api-stub.mjs, which implements the same contract as the
   deployed function. */

/* The board polls the shared endpoint, so the network never goes quiet.
   "networkidle" would be a coin toss here; every wait below is for the thing
   the next step actually needs. */
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

const revOf = async () => (await (await fetch(`${BASE}/api/board`)).json()).rev;

/* A phone that has not said whose it is reads the board and writes nothing.
   The prompt was skippable, and a change that reaches the shared board with
   nobody's name on it cannot be attributed afterwards: the other person sees
   "someone" moved their task and there is no way back from that. So the work
   waits on the device until the question is answered, and then goes up. */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?date=${fx.todayIso}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#passcode:not([disabled])", { timeout: 20000 });
  await page.fill("#passcode", process.env.SKYMO_PASSCODE);
  await page.click('button[type="submit"]');
  await page.waitForSelector(`text=${day}`, { timeout: 30000 });

  /* Deliberately leaves "Whose phone is this?" unanswered. */
  await page.click('button:has-text("Families")');
  await page.waitForSelector("text=on the caseload");
  await page.click(`button:has-text("${fam}")`);
  await page.waitForSelector("text=Open tasks", { timeout: 10000 });
  await page.locator('main [role="checkbox"]').first().click();
  await page.waitForTimeout(SETTLE);

  (await revOf()) === 0
    ? ok("a phone that has not said whose it is writes nothing to the shared board")
    : bad(`an unidentified phone wrote to the shared board (revision ${await revOf()})`);

  const pick = page
    .locator("div", { has: page.locator('div:text-is("Whose phone is this?")') })
    .last()
    .locator('button:text-is("Skylar")');
  await pick.first().click();
  await page.waitForTimeout(SETTLE);

  const after = await revOf();
  after > 0
    ? ok(`answering it sends the held work straight up (revision ${after})`)
    : bad("answering who is holding the phone did not release the held work");

  const board = await (await fetch(`${BASE}/api/board`)).json();
  /* The document is ciphertext here, so this checks the one thing visible
     from outside: that something was written at all. Whose name is on it is
     checked below, where a second device can read it. */
  board.blob ? ok("the released work is stored encrypted") : bad("nothing was stored");
  await ctx.close();
}

/* Back to empty, so the suite below starts where it expects to. */
await fetch(`${BASE}/api/board`, { method: "DELETE" });

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
  await page.goto(`${BASE}/?date=${fx.todayIso}`, { waitUntil: "domcontentloaded" });
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
  await page.reload({ waitUntil: "domcontentloaded" });
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

/* Handing a task over. A lane change on its own told the other person nothing:
   they found something in their lane with no idea who put it there, when, or
   what they were meant to do with it. */
{
  const what = `handover probe ${Date.now().toString().slice(-5)}`;
  const note = `ring the school first ${Date.now().toString().slice(-4)}`;
  await openFamily(A);
  await A.fill('input[aria-label="Add a task to this family"]', what);
  await A.locator('form button:text-is("Add")').click();
  await A.waitForSelector(`main button:has-text("${what}")`, { timeout: 10000 });

  /* Open it, give it to Mo, and say why. */
  await A.locator(`main button:has-text("${what}")`).first().click();
  await A.waitForSelector('main button:text-is("Both")', { timeout: 5000 });
  await A.locator('main button:text-is("Mo")').first().click();
  await A.waitForTimeout(300);
  const noteBox = A.locator('input[aria-label="Note for the person you are passing this to"]');
  (await noteBox.count())
    ? ok("passing a task to the other person asks what they need to know")
    : bad("passing a task offered nowhere to say why");
  await noteBox.first().fill(note);
  await A.waitForTimeout(SETTLE);

  await refresh(B);
  const seen = await B.textContent("main");
  if (!seen.includes(what)) bad("the handed-over task never reached the other phone");
  seen.includes("Skylar passed this to you")
    ? ok("the other phone says who passed it over")
    : bad("a handed-over task arrived with nobody's name on it");
  seen.includes(note)
    ? ok("and carries the line that came with it")
    : bad("the handover note did not travel");
}

/* Who marked a reminder sent. Both of them texting the same family the night
   before a visit is the thing this prevents, and "Sent ✓" with no name on it
   does not prevent it. */
if (fx.reminderVisits.length) {
  await A.click('button:has-text("Texts")');
  await A.waitForSelector("text=Mark sent", { timeout: 10000 });
  await A.locator('button:text-is("Mark sent")').first().click();
  await A.waitForTimeout(SETTLE);

  await B.reload({ waitUntil: "domcontentloaded" });
  await B.waitForSelector(`text=${day}`, { timeout: 30000 });
  await B.waitForTimeout(SETTLE);
  await B.click('button:has-text("Texts")');
  await B.waitForSelector("text=Mark sent", { timeout: 10000 });
  (await B.textContent("main")).includes("Skylar sent this")
    ? ok("a reminder marked sent says which of them sent it")
    : bad("the other phone cannot tell who sent the reminder");
  await B.click('button:has-text("Day")');
  await A.click('button:has-text("Day")');
  await A.waitForTimeout(SETTLE);
}

/* An idle board must not write. The catch-up timer pulls every forty-five
   seconds so the other person's ticks arrive; it used to push every time as
   well, re-uploading a document nobody had touched. Left open on two phones
   that is thousands of writes a day against the function's quota, and the
   first thing to break would have been the sync. */
const restAt = await revOf();
/* Both devices are settled and in agreement. Poke each into a catch-up sync
   the way returning to the app does, then see whether anything was written. */
await A.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
await B.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
await A.waitForTimeout(4000);
const afterRest = await revOf();
afterRest === restAt
  ? ok(`two idle boards syncing wrote nothing (revision stayed at ${restAt})`)
  : bad(`an idle board is still writing: revision went ${restAt} -> ${afterRest}`);

await browser.close();
