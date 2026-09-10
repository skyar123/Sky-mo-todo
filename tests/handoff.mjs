/* Giving a file to the phone.

   The calendar buttons did nothing on an iPhone: they used an anchor with the
   `download` attribute, which iOS Safari ignores. There is no iPhone here, so
   the share API is stubbed and the assertion is that the app reaches for it,
   with a real text/calendar file, rather than falling back to the anchor. */

import { chromium } from "playwright";
import { loadFixture } from "./fixture.mjs";
import { LONG } from "../src/lib/dates.js";

const BASE = process.env.BASE || "http://localhost:4173";
const fx = await loadFixture();
const day = LONG[fx.today.getDay()];

const ok = (m) => console.log("  ok   " + m);
const bad = (m) => { console.log("  FAIL " + m); process.exitCode = 1; };

const browser = await chromium.launch(
  process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}
);
const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });

/* Stand in for a phone that offers the share sheet, and record what it is given. */
await ctx.addInitScript(() => {
  window.__shared = [];
  navigator.canShare = (data) => !!data && Array.isArray(data.files) && data.files.length > 0;
  navigator.share = async (data) => {
    window.__shared.push(
      await Promise.all(
        (data.files || []).map(async (f) => ({ name: f.name, type: f.type, text: await f.text() }))
      )
    );
  };
});

const page = await ctx.newPage();
page.on("pageerror", (e) => bad(`page error: ${String(e).slice(0, 120)}`));

await page.goto(`${BASE}/?date=${fx.todayIso}`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("#passcode:not([disabled])", { timeout: 20000 });
await page.fill("#passcode", process.env.SKYMO_PASSCODE);
await page.click('button[type="submit"]');
await page.waitForSelector(`text=${day}`, { timeout: 30000 });

/* The standing reminder to text families, from the Texts tab. */
await page.click('button:has-text("Texts")');
await page.waitForSelector('button:has-text("Remind me to send these")', { timeout: 8000 });
await page.click('button:has-text("Remind me to send these")');
await page.waitForTimeout(900);

const shared = await page.evaluate(() => window.__shared);
if (!shared.length) {
  bad("nothing was handed to the share sheet; an iPhone would see this do nothing");
} else {
  const [file] = shared[0];
  ok(`the share sheet was offered a file (${file.name})`);
  file.type.startsWith("text/calendar")
    ? ok("it is a calendar file, so Calendar appears in the sheet")
    : bad(`wrong type: ${file.type}`);
  file.text.startsWith("BEGIN:VCALENDAR") && file.text.includes("RRULE:FREQ=WEEKLY")
    ? ok("it holds the repeating morning-before reminders")
    : bad("the calendar file is not what it should be");
}

/* And a due date from the day view. */
await page.click('button:has-text("Day")');
await page.waitForSelector(`text=${day}`);
const addAll = page.locator('button:has-text("to my calendar")').first();
if (await addAll.count()) {
  await addAll.click();
  await page.waitForTimeout(900);
  const again = await page.evaluate(() => window.__shared.length);
  again > shared.length
    ? ok("due dates go to the share sheet too")
    : bad("the due-date button did not hand anything over");
} else {
  ok("no due dates to add this week, nothing to check");
}

await browser.close();
