/* End-to-end walk through the board in a real browser.
   Run with: npm test   (builds, serves, then drives it)

   Every expectation comes from tests/fixture.mjs, which decrypts the real
   caseload at run time. No family, child or task text is written into this
   file: the repo is public and the tests are not an exception to that. */

/* The board polls the shared endpoint, so the network never goes quiet.
   "networkidle" would be a coin toss here; every wait below is for the thing
   the next step actually needs. */
import { chromium } from "playwright";
import { loadFixture } from "./fixture.mjs";
import { spokenDate, LONG, fmtDay, addDays } from "../src/lib/dates.js";

const SHOTS = process.env.SHOTS || "tests/shots";
const BASE = process.env.BASE || "http://localhost:4173";

const log = [];
const ok = (m) => log.push("  ok   " + m);
const bad = (m) => { log.push("  FAIL " + m); process.exitCode = 1; };
const check = (cond, good, why) => (cond ? ok(good) : bad(why || good));

const fx = await loadFixture();
const weekStart = addDays(fx.today, -((fx.today.getDay() + 6) % 7));

const browser = await chromium.launch(
  process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}
);
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });

await page.goto(`${BASE}/?date=${fx.todayIso}`, { waitUntil: "domcontentloaded" });

/* --- locked --- */
await page.waitForSelector("#passcode:not([disabled])", { timeout: 15000 });
ok("lock screen renders and enables input");
const locked = await page.textContent("body");
check(
  !fx.families.some((f) => locked.includes(f.name)),
  "no caseload content before unlock",
  "caseload visible before unlock"
);
await page.screenshot({ path: `${SHOTS}/01-lock.png` });

await page.fill("#passcode", "0000000000");
await page.click('button[type="submit"]');
await page.waitForSelector('[role="alert"]:has-text("did not work")', { timeout: 20000 });
ok("wrong passcode is rejected");

/* --- unlocked --- */
await page.fill("#passcode", process.env.SKYMO_PASSCODE);
await page.click('button[type="submit"]');
await page.waitForSelector(`text=${LONG[fx.today.getDay()]}`, { timeout: 25000 });
ok("correct passcode unlocks the board");
await page.screenshot({ path: `${SHOTS}/02-day.png` });

const day = await page.textContent("main");
check(day.includes(fmtDay(fx.today)), "day tab shows today's date");
for (const v of fx.todayVisits) {
  check(day.includes(v.name) && day.includes(v.time), `day tab lists a visit at ${v.time}`);
}
check(
  fx.unscheduled.every((f) => !day.includes(f.name)),
  "families with no standing slot stay off the day view",
  "an unscheduled family leaked onto the day view"
);
if (fx.reminderDay) {
  check(
    day.includes(`Send reminders for ${spokenDate(fx.reminderDay)}`),
    "reminder nudge targets the next visit day"
  );
}
/* Times with nothing behind them look exactly like times from a calendar, and
   on a two-phone board that is how one of them ends up at the wrong door. */
check(
  day.includes("not reading a calendar"),
  "a phone with no calendar says so rather than passing standing times off as real",
  "standing times were shown with no sign that this phone has no calendar"
);

/* --- family detail --- */
const fam0 = fx.withChild;
const openFamily = async (name) => {
  await page.click('button:has-text("Families")');
  await page.waitForSelector("text=on the caseload", { timeout: 8000 });
  await page.click(`button:has-text("${name}")`);
};
await openFamily(fam0.name);
await page.waitForSelector("text=Before you go in", { timeout: 8000 });
ok("family detail opens");
const famText = await page.textContent("main");
check(famText.includes(fam0.child), "child line present");
check(famText.includes(fam0.clinician), "clinician shown");
await page.screenshot({ path: `${SHOTS}/03-family.png`, fullPage: true });

/* --- ticking a task, and whether it survives a reload --- */
const boxes = page.locator('main [role="checkbox"]');
await boxes.first().click();
await page.waitForTimeout(700);
check((await page.locator('main [role="checkbox"][aria-checked="true"]').count()) >= 1, "a task can be ticked");

await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForSelector(`text=${LONG[fx.today.getDay()]}`, { timeout: 25000 });
ok("stays unlocked across a reload (device key cached)");
await openFamily(fam0.name);
await page.waitForSelector("text=Before you go in");
check(
  (await page.locator('main [role="checkbox"][aria-checked="true"]').count()) >= 1,
  "the tick survived the reload"
);

/* --- supplies --- */
await page.click('button:has-text("Supplies")');
await page.waitForTimeout(250);
await page.click('main button:has-text("Diapers")');
await page.waitForTimeout(350);
check((await page.textContent("main")).includes("Log a drop today"), "supply toggle reveals drop logging");
await page.click('button:has-text("‹ back")');
await page.waitForTimeout(300);

/* --- search --- */
await page.click('button[aria-label="Search"]');
const childName = fam0.child.split(",")[0].trim();
await page.fill("#q", childName);
await page.waitForTimeout(450);
check((await page.textContent("main")).includes(fam0.name), "search finds a family by the child's name");

if (fx.searchWord && fx.searchOwner) {
  await page.fill("#q", fx.searchWord);
  await page.waitForTimeout(450);
  check(
    (await page.textContent("main")).includes(fx.searchOwner.name),
    "search finds a task by a word inside it"
  );
}
await page.screenshot({ path: `${SHOTS}/04-search.png` });
await page.click('button[aria-label="Close search"]');

/* --- texts --- */
await page.click('button:has-text("Texts")');
await page.waitForSelector("text=Reminders", { timeout: 8000 });
const texts = await page.textContent("main");
if (fx.reminderDay) {
  check(texts.includes(spokenDate(fx.reminderDay)), "texts tab defaults to the next visit day");
}
if (fx.firstVisit && fx.reminderVisits.some((v) => v.id === fx.firstVisit.id)) {
  check(texts.includes("This is Skylar with Child First"), "first-visit tone used for a first visit");
}
await page.screenshot({ path: `${SHOTS}/05-texts.png` });

/* --- print --- */
await page.click('button:has-text("Print")');
await page.waitForSelector("text=Plain paper", { timeout: 8000 });
check((await page.textContent("main")).includes(`week of ${fmtDay(weekStart)}`), "print header shows the right week start");
await page.screenshot({ path: `${SHOTS}/06-print.png`, fullPage: true });

/* --- pasting notes --- */
const target = fx.families.find((f) => f.alias?.length && f.id !== fam0.id) || fam0;
const alias = target.alias[0];
const phrase = `bring wipes to ${alias} 9/30`;
await page.click('button:has-text("Day")');
await page.click('button[aria-label="Add tasks"]');
await page.waitForSelector("#notes");
await page.fill("#notes", `${phrase}\ncall the clinic`);
// Exact match: "Add these N to my calendar" and the quick-add button both
// contain "Add", and the paste sheet's submit is the one meant here.
await page.click('button:text-is("Add")');
await page.waitForTimeout(700);
await openFamily(target.name);
await page.waitForTimeout(400);
check((await page.textContent("main")).includes(phrase), "a pasted note routes to the family it names");

/* --- the teaming agenda --- */
await page.click('button:has-text("Day")');
await page.waitForSelector(`text=${LONG[fx.today.getDay()]}`);
/* The block sits on one day of the week, so on every other day the way in is
   the standing "to bring up" row. Both carry the same label; matching on the
   word alone matched a task that merely mentioned teaming. */
const teamingBtn = page.locator('button[aria-label="Open the teaming agenda"]').first();
check(await teamingBtn.count() > 0, "the teaming agenda is reachable on any day");
if (await teamingBtn.count()) {
  await teamingBtn.click();
  await page.waitForSelector('input[aria-label="Add something to bring up at teaming"]', { timeout: 8000 });
  ok("the teaming block opens its agenda");

  const seeded = await page.textContent("main");
  check(/fidelity form/i.test(seeded), "the week's teaming topic is already on the list");

  const raise = `raise this ${Date.now().toString().slice(-4)}`;
  await page.fill('input[aria-label="Add something to bring up at teaming"]', raise);
  await page.locator('form button:text-is("Add")').click();
  await page.waitForTimeout(600);
  check((await page.textContent("main")).includes(raise), "something can be added to bring up");

  /* It has to still be there after a reload, or it is not an agenda. */
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(`text=${LONG[fx.today.getDay()]}`, { timeout: 25000 });
  await page.locator('button:has-text("Teaming")').first().click();
  await page.waitForSelector('input[aria-label="Add something to bring up at teaming"]');
  check((await page.textContent("main")).includes(raise), "the agenda survives a reload");
} else {
  bad("no teaming block on the day view");
}

/* --- locking again --- */
await page.click('button:has-text("‹ back")');
await page.click('button[aria-label="Backup and lock"]');
await page.waitForSelector('button:has-text("Lock this device")');
await page.click('button:has-text("Lock this device")');
await page.waitForSelector("#passcode", { timeout: 8000 });
ok("lock button returns to the passcode screen");
const afterLock = await page.textContent("body");
check(
  !fx.families.some((f) => afterLock.includes(f.name)),
  "caseload is gone after locking",
  "caseload still visible after locking"
);

console.log(log.join("\n"));
console.log(errors.length ? "\nPAGE ERRORS:\n" + errors.slice(0, 8).join("\n") : "\nNo page errors.");
if (errors.length) process.exitCode = 1;
await browser.close();
