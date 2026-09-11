/* Live calendar, with Google stubbed.

   There is no Google sign-in reachable from here, so the token client and the
   Calendar API are both stood in for. What is being checked is the app's own
   behaviour: that it asks for a calendar, picks the Child First one, renders
   the day from real events rather than the typed-in times, and above all that
   it never lists or reads the two calendars holding clients' legal names. */

import { chromium } from "playwright";
import { loadFixture } from "./fixture.mjs";
import { LONG } from "../src/lib/dates.js";

const BASE = process.env.BASE || "http://localhost:4173";
const fx = await loadFixture();
const day = LONG[fx.today.getDay()];

const ok = (m) => console.log("  ok   " + m);
const bad = (m) => { console.log("  FAIL " + m); process.exitCode = 1; };
const check = (cond, good, why) => (cond ? ok(good) : bad(why || good));

/* Two of these must never be offered or fetched. */
const CALENDARS = [
  { id: "cf@group.calendar.google.com", summary: "Child First-Skylar" },
  { id: "assess@group.calendar.google.com", summary: "Assessment Schedule " },
  { id: "remind@group.calendar.google.com", summary: "Client Assesment Reminders" },
  { id: "primary", summary: "skylarbelt@gmail.com", primary: true },
];

/* A day that deliberately disagrees with the typed-in board. Titles come from
   the caseload's own aliases rather than being written here: the repository is
   public and no family belongs in it, not even in a test. */
const at = (h, m = 0) => {
  const d = new Date(fx.today);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

const subject = fx.families.find((f) => f.alias?.length && f.time);
if (!subject) throw new Error("no family with an alias and a standing time to test against");
/* Written the way a calendar entry is, with a trailing colon. */
const title = `${subject.alias[0]}:`;
const LIVE_TIME = "3:45";

const EVENTS = [
  { id: "e1", status: "confirmed", summary: title, start: { dateTime: at(15, 45) }, end: { dateTime: at(16, 45) } },
  { id: "e2", status: "confirmed", summary: "UNMATCHEDPROBE appointment", start: { dateTime: at(10) }, end: { dateTime: at(11) } },
  { id: "e3", status: "cancelled", summary: "CANCELLEDPROBE", start: { dateTime: at(9) }, end: { dateTime: at(10) } },
];

const browser = await chromium.launch(
  process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}
);
const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });

/* Stand in for Google Identity Services. */
await ctx.addInitScript(() => {
  window.__googleCalls = [];
  window.google = {
    accounts: {
      oauth2: {
        initTokenClient: (cfg) => ({
          requestAccessToken: () => {
            window.__googleCalls.push({ scope: cfg.scope });
            cfg.callback({ access_token: "stub-token", expires_in: 3600 });
          },
        }),
      },
    },
  };
});

/* Stand in for the Calendar API, recording every path asked for. */
const fetched = [];
await ctx.route("https://www.googleapis.com/**", async (route) => {
  const url = new URL(route.request().url());
  fetched.push(decodeURIComponent(url.pathname));
  const body = url.pathname.endsWith("/calendarList")
    ? { items: CALENDARS }
    : { items: EVENTS };
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
});
/* The real GIS script is unreachable here; the stub above already stands in. */
await ctx.route("https://accounts.google.com/**", (route) => route.fulfill({ status: 200, body: "" }));

const page = await ctx.newPage();
page.on("pageerror", (e) => bad(`page error: ${String(e).slice(0, 140)}`));

await page.goto(`${BASE}/?date=${fx.todayIso}`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("#passcode:not([disabled])", { timeout: 20000 });
await page.fill("#passcode", process.env.SKYMO_PASSCODE);
await page.click('button[type="submit"]');
await page.waitForSelector(`text=${day}`, { timeout: 30000 });

await page.click('button[aria-label="Backup and lock"]');

/* No client id ships in the bundle, so the first thing the screen asks for is
   the one naming your own Google project. Connecting is not offered until it
   has one, which is the whole point: a wrong id fails inside a Google popup
   where nothing can explain it. */
await page.waitForSelector('input[aria-label="Google client id"]', { timeout: 8000 });
check(
  (await page.locator('button:has-text("Connect Google Calendar")').count()) === 0,
  "connecting is not offered until there is a client id"
);
await page.fill('input[aria-label="Google client id"]', "000000000000-teststub.apps.googleusercontent.com");
await page.click('button:text-is("Use this one")');

await page.waitForSelector('button:has-text("Connect Google Calendar")', { timeout: 8000 });
await page.click('button:has-text("Connect Google Calendar")');
await page.waitForSelector('button:has-text("Disconnect")', { timeout: 15000 });
ok("connects and stays connected");

const scope = await page.evaluate(() => window.__googleCalls[0]?.scope);
scope === "https://www.googleapis.com/auth/calendar.readonly"
  ? ok("asks for read-only access only")
  : bad(`wrong scope: ${scope}`);

const sheet = await page.textContent('div[role], body');
/Child First-Skylar/.test(sheet)
  ? ok("picked the Child First calendar by itself")
  : bad("did not pick the Child First calendar");

/* The rule that matters most. */
const offered = await page.textContent("body");
/Assessment Schedule|Client Assesment/i.test(offered)
  ? bad("a calendar holding legal names was offered in the interface")
  : ok("the legal-name calendars are never offered");

const badFetch = fetched.filter((p) => /assess|remind/i.test(p));
badFetch.length
  ? bad(`fetched a forbidden calendar: ${badFetch.join(", ")}`)
  : ok("the legal-name calendars are never fetched");

/* Now the day itself. */
await page.click('button:has-text("Close")').catch(() => {});
await page.keyboard.press("Escape");
await page.waitForTimeout(500);
await page.click('button:has-text("Day")');
await page.waitForSelector(`text=${day}`);
await page.waitForTimeout(1200);

const main = await page.textContent("main");
/from your calendar/.test(main)
  ? ok("the day says where its times came from")
  : bad("the day does not say it is using the calendar");
main.includes(LIVE_TIME) && LIVE_TIME !== subject.time
  ? ok(`shows the calendar's time (${LIVE_TIME}), not the one typed into the board (${subject.time})`)
  : bad("did not take the time from the calendar");
/UNMATCHEDPROBE/.test(main)
  ? ok("an event matching no family is still shown rather than dropped")
  : bad("an unmatched event vanished");
/CANCELLEDPROBE/.test(main)
  ? bad("a cancelled event was shown")
  : ok("cancelled events are left out");

/* And it has to survive losing the network, since that is the point of the cache. */
await ctx.setOffline(true);
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForSelector(`text=${day}`, { timeout: 30000 });
await page.waitForTimeout(1500);
(await page.textContent("main")).includes(LIVE_TIME)
  ? ok("the last calendar it read still shows with no signal")
  : bad("the day lost its calendar times offline");
await ctx.setOffline(false);

await browser.close();
