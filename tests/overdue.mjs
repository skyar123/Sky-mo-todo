/* Working through what has gone past its date.

   Ten things two weeks over used to mean ten trips into ten families, so they
   never got dealt with and the bottom of the day screen turned into a wall of
   red nobody read. This suite drives the screen that replaced that: one list,
   three answers, one tap each.

   Expectations are recomputed here from the decrypted caseload rather than
   read off the screen, so a wrong date is a failure and not a tautology. */

import { chromium } from "playwright";
import { loadFixture } from "./fixture.mjs";
import { LONG, dueInfo, iso, addDays, fmtShort } from "../src/lib/dates.js";
import { isScheduled } from "../src/lib/schedule.js";

const BASE = process.env.BASE || "http://localhost:4173";
const fx = await loadFixture();
const day = LONG[fx.today.getDay()];

const ok = (m) => console.log("  ok   " + m);
const bad = (m) => { console.log("  FAIL " + m); process.exitCode = 1; };
const check = (cond, good, why) => (cond ? ok(good) : bad(why || good));

/* Nobody else's ticks, so the counts below are the caseload's own. */
await fetch(`${BASE}/api/board`, { method: "DELETE" });

const byId = new Map(fx.families.map((f) => [f.id, f]));
const expected = fx.seedTasks
  .filter((t) => {
    if (t.done || !t.due) return false;
    const d = dueInfo(t.due, fx.today);
    return d && d.days < 0;
  })
  .sort((a, b) => a.due.localeCompare(b.due));

if (!expected.length) {
  ok("nothing on the caseload is past due, so there is nothing to work through");
  process.exit(0);
}

/* No calendar is connected in here, so the next visit is the standing day. */
const nextStandingVisit = (family) => {
  if (!family || !isScheduled(family)) return null;
  for (let i = 1; i <= 28; i++) {
    const d = addDays(fx.today, i);
    if (d.getDay() === family.day) return d;
  }
  return null;
};

const browser = await chromium.launch(
  process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}
);
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
page.on("pageerror", (e) => bad(`page error: ${String(e).slice(0, 140)}`));

await page.goto(`${BASE}/?date=${fx.todayIso}`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("#passcode:not([disabled])", { timeout: 20000 });
await page.fill("#passcode", process.env.SKYMO_PASSCODE);
await page.click('button[type="submit"]');
await page.waitForSelector(`text=${day}`, { timeout: 25000 });
await page.waitForTimeout(1200);

/* --- the door --- */
const dayText = await page.textContent("main");
check(
  dayText.includes(`${expected.length} past due`),
  `the day screen says how many are past due (${expected.length})`,
  `the day screen does not name the past-due count: expected ${expected.length}`
);
check(
  !/Due this week[\s\S]*\dd over/.test(dayText),
  "the week's due list no longer carries the already-late ones",
  "already-late tasks are still padding out the due-this-week list"
);

await page.click('button:has-text("past due")');
await page.waitForSelector("text=Past due", { timeout: 8000 });
await page.waitForTimeout(400);
const screen = await page.textContent("main");

/* --- the list --- */
for (const t of expected.slice(0, 6)) {
  const family = t.client ? byId.get(t.client) : null;
  const label = dueInfo(t.due, fx.today).label;
  check(
    screen.includes(t.text) && screen.includes(label),
    `${label}: listed with how far over it is`,
    `a task ${label} is missing from the screen or has the wrong label`
  );
  if (family) {
    check(screen.includes(family.name), `and says which family it belongs to`);
  }
}

const first = expected[0];
const firstLabel = dueInfo(first.due, fx.today).label;
const secondLabel = expected.length > 1 ? dueInfo(expected[1].due, fx.today).label : null;
if (secondLabel && firstLabel !== secondLabel) {
  check(
    screen.indexOf(firstLabel) < screen.indexOf(secondLabel),
    "the longest overdue is at the top",
    "the list is not ordered by how late things are"
  );
}

/* --- the offer is the family's own next visit, not a generic week --- */
const withFamily = expected.find((t) => t.client && nextStandingVisit(byId.get(t.client)));
if (withFamily) {
  const when = nextStandingVisit(byId.get(withFamily.client));
  check(
    screen.includes(`Next visit · ${fmtShort(when)}`),
    `the offer is that family's own next visit (${fmtShort(when)}), not a flat week`,
    `expected "Next visit · ${fmtShort(when)}" on the screen`
  );
}
const loose = expected.find((t) => !t.client);
if (loose) {
  check(screen.includes("Next week"), "something with no family is offered next week instead");
}

/* --- acting on one --- */
async function act(task, button) {
  await page.locator(`[data-overdue="${task.id}"] button:has-text("${button}")`).first().click();
  await page.waitForTimeout(500);
}

if (withFamily) {
  const when = nextStandingVisit(byId.get(withFamily.client));
  await act(withFamily, "Next visit");
  /* By row, not by wording: two families carry tasks worded identically, so
     the text is still on screen and proves nothing either way. */
  check(
    (await page.locator(`[data-overdue="${withFamily.id}"]`).count()) === 0,
    "a task pushed to the next visit leaves the pile"
  );

  /* And really moved, not merely hidden: it is on the board with the new date. */
  await page.click('button:has-text("‹ back")');
  await page.waitForSelector(`text=${day}`, { timeout: 8000 });
  await page.click('button:has-text("Families")');
  await page.waitForSelector("text=on the caseload", { timeout: 8000 });
  await page.click(`button:has-text("${byId.get(withFamily.client).name}")`);
  await page.waitForSelector("text=Open tasks", { timeout: 8000 });
  await page.click(`main button:has-text("${withFamily.text}")`);
  await page.waitForTimeout(400);
  const value = await page.inputValue('input[aria-label="Due date"]');
  check(
    value === iso(when),
    `the new date really is on the task (${iso(when)})`,
    `the task's due date is ${value}, expected ${iso(when)}`
  );
  await page.click('button:has-text("‹ back")').catch(() => {});
  await page.waitForTimeout(300);
  await page.click('button:has-text("Day")');
  await page.waitForTimeout(600);
}

/* --- clearing a date leaves the task alive --- */
const toClear = expected.find((t) => t !== withFamily && t.client);
if (toClear) {
  await page.click('button:has-text("past due")');
  await page.waitForSelector("text=Past due", { timeout: 8000 });
  await act(toClear, "No date");
  check(
    (await page.locator(`[data-overdue="${toClear.id}"]`).count()) === 0,
    "a task with its date cleared leaves the pile"
  );

  await page.click('button:has-text("‹ back")');
  await page.waitForTimeout(400);
  await page.click('button:has-text("Families")');
  await page.waitForSelector("text=on the caseload", { timeout: 8000 });
  await page.click(`button:has-text("${byId.get(toClear.client).name}")`);
  await page.waitForSelector("text=Open tasks", { timeout: 8000 });
  check(
    (await page.textContent("main")).includes(toClear.text),
    "and is still there under its family, just no longer asking",
    "clearing the date deleted the task"
  );
}

await browser.close();
