#!/usr/bin/env node
/* The board on a phone, held in one hand.

   Every check here comes from something that was actually wrong on an iPhone:
   the page scrolled sideways and cut the end off every line, the tick boxes
   were half the width of a thumb, focusing a field made iOS zoom in and clip
   the rest, and a supervision item with no family could be put somewhere with
   no way back to it. */

import { chromium } from "playwright";
import { loadFixture } from "./fixture.mjs";
import { LONG } from "../src/lib/dates.js";

const BASE = process.env.BASE || "http://localhost:4173";
const fx = await loadFixture();

const ok = (m) => console.log("  ok   " + m);
const bad = (m) => { console.log("  FAIL " + m); process.exitCode = 1; };
const check = (cond, good, why) => (cond ? ok(good) : bad(why || good));

const browser = await chromium.launch(
  process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}
);
/* The narrow end of the iPhone range, where anything too wide shows first. */
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 3 });
const page = await ctx.newPage();
page.on("pageerror", (e) => bad(`page error: ${String(e).slice(0, 140)}`));

await page.goto(`${BASE}/?date=${fx.todayIso}`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("#passcode:not([disabled])", { timeout: 20000 });
await page.fill("#passcode", process.env.SKYMO_PASSCODE);
await page.click('button[type="submit"]');
await page.waitForSelector(`text=${LONG[fx.today.getDay()]}`, { timeout: 30000 });
await page.waitForTimeout(1200);

const widths = () =>
  page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));

const smallTargets = () =>
  page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('[role="checkbox"]')) {
      const r = el.getBoundingClientRect();
      if (!r.width) continue;
      /* The drawn box may be small as long as what a thumb can hit is not. */
      const after = getComputedStyle(el, "::after");
      const hit = Math.min(parseFloat(after.width) || r.width, parseFloat(after.height) || r.height);
      if (hit < 44) out.push({ label: el.getAttribute("aria-label") || "", hit });
    }
    return out;
  });

const zoomers = () =>
  page.evaluate(() =>
    [...document.querySelectorAll("input, textarea, select")]
      .filter((el) => el.type !== "hidden" && parseFloat(getComputedStyle(el).fontSize) < 16)
      .map((el) => el.getAttribute("aria-label") || el.id || el.tagName)
  );

async function sweepScreen(label) {
  const w = await widths();
  check(w.scroll <= w.client, `${label}: the page does not scroll sideways`,
    `${label}: page is ${w.scroll - w.client}px wider than the screen`);
  const z = await zoomers();
  check(z.length === 0, `${label}: no field small enough to make iOS zoom`,
    `${label}: these fields would zoom: ${z.join(", ")}`);
}

await sweepScreen("day");

/* The screen the whole app is for: a family with its tasks. */
await page.click('button:has-text("Families")');
await page.waitForTimeout(400);
await page.locator("main button").filter({ hasText: /\w/ }).nth(1).click();
await page.waitForTimeout(800);
await sweepScreen("a family");

const small = await smallTargets();
check(small.length === 0, "every tick box is at least a thumb across",
  `${small.length} tick boxes are under 44px: ${small.map((s) => Math.round(s.hit)).join(", ")}`);

/* Which side they sit on is a setting, because a right thumb cannot reach the
   left edge of a phone this size without shuffling it in the hand. */
const rowDirection = () =>
  page.evaluate(() => {
    const row = document.querySelector("main .handed");
    return row ? getComputedStyle(row).flexDirection : null;
  });

check((await rowDirection()) === "row", "tick boxes start on the left");
await page.keyboard.press("Escape");
await page.click('button[aria-label="Backup and lock"]');
await page.waitForSelector('button:has-text("Right")', { timeout: 8000 });
await page.click('button:has-text("Right")');
await page.click('[data-noswipe] button:text-is("Close")');
await page.waitForTimeout(400);
await page.click('button:has-text("Families")');
await page.waitForTimeout(400);
await page.locator("main button").filter({ hasText: /\w/ }).nth(1).click();
await page.waitForTimeout(700);
check((await rowDirection()) === "row-reverse", "and move to the right when the setting says so");
await sweepScreen("a family, right-handed");

/* --- the item that used to disappear ---------------------------------- */

/* A supervision topic typed into the teaming box has no family, and taking it
   off the teaming list used to put it on no screen at all: still on the board,
   findable only by searching for words you had already forgotten. */
await page.click('[data-noswipe] button:text-is("Close")').catch(() => {});
await page.click('button:has-text("Day")');
await page.waitForTimeout(400);
await page.locator('button[aria-label="Open the teaming agenda"]').first().click();
await page.waitForSelector('input[aria-label="Add something to bring up at teaming"]', { timeout: 8000 });

const topic = `supervision probe ${Date.now().toString().slice(-5)}`;
await page.fill('input[aria-label="Add something to bring up at teaming"]', topic);
await page.locator('form button:text-is("Add")').click();
await page.waitForTimeout(600);
check((await page.textContent("main")).includes(topic), "a supervision topic can be added");

/* It opens, and it has the two things it never had: a family and a flag. */
await page.locator(`main button:has-text("${topic}")`).first().click();
await page.waitForTimeout(400);
check(
  await page.locator('select[aria-label="Family this is about"]').isVisible(),
  "opening it offers a family to tie it to"
);
await page.locator('button:text-is("☆ Must cover")').last().click();
await page.waitForTimeout(500);
check(
  (await page.textContent("main")).includes("★"),
  "and a flag for the ones that have to be reached"
);

await page.locator('button:has-text("Take off the list")').first().click();
await page.waitForTimeout(800);
check(!(await page.textContent("main")).includes(topic), "taking it off removes it from Thursday");

await page.click('button:has-text("Families")');
await page.waitForTimeout(600);
const famText = await page.textContent("main");
check(/not tied to a family/i.test(famText), "and Families now offers the things tied to no family");
await page.locator('main button:has-text("not tied to a family")').first().click();
await page.waitForTimeout(700);
check(
  (await page.textContent("main")).includes(topic),
  "where the topic is waiting, instead of gone for good"
);

/* --- the week, looking backwards --------------------------------------- */

await page.locator(`main [role="checkbox"]`).first().click();
await page.waitForTimeout(700);

/* The week view shows the week of the date being looked at, and the rest of
   this suite pins that date for repeatability. Ticking happens in real time,
   so read the week without the pin. */
await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.waitForSelector('button:has-text("Week")', { timeout: 30000 });
await page.waitForTimeout(1500);
await page.click('button:has-text("Week")');
await page.waitForTimeout(900);
const week = await page.textContent("main");
check(/This week/.test(week), "the week view opens");
check(week.includes(topic), "and shows what was ticked off, which nothing else did");
await sweepScreen("the week");

await browser.close();
