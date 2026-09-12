#!/usr/bin/env node
/* The weekly document, pasted into the board.

   This is the join between the two halves of the system: a routine writes one
   Google Doc holding every family's follow-up items, and the board has to turn
   that into tasks on the right families' screens. The shape here is copied from
   a real sweep: a SCHEDULE section, then blocks headed "<Pseudonym>: Visit
   Notes", separated by a rule, with a bare checkbox on its own line and the
   item text below it.

   The family names come from the encrypted caseload at runtime, the same way
   the calendar suite gets them. The item text is invented. Nothing a client
   said is in this file. */

import { chromium } from "playwright";
import { loadFixture } from "./fixture.mjs";
import { LONG } from "../src/lib/dates.js";

const BASE = process.env.BASE || "http://localhost:4173";
const fx = await loadFixture();

const log = [];
const ok = (m) => console.log("  ok   " + m);
const bad = (m) => { console.log("  FAIL " + m); process.exitCode = 1; };
const check = (cond, good, why) => (cond ? ok(good) : bad(why || good));

/* Three families that can be told apart on screen afterwards. */
const picked = fx.families.filter((f) => f.alias?.length).slice(0, 3);
if (picked.length < 3) throw new Error("need three families with aliases to test a multi-family paste");

/* Unique enough to find again, and meaningless. The board capitalises a task's
   first letter, so everything that looks for these again does it case-blind. */
const tag = Date.now().toString().slice(-5);
const item = (n) => `probe ${tag} item ${n}`;
const has = (hay, needle) => hay.toLowerCase().includes(needle.toLowerCase());
const countIn = (hay, re) => (hay.match(re) || []).length;

const block = (f, n) => `${f.alias[0]}: Visit Notes

Before next visit
☐
${item(n)}a, and a second clause so the line is long enough to keep.
☐
${item(n)}b, bring the box of cards and the small torch.

Bring to the clinical partner
Pacing of the piece we started, and whose part is whose before the next one.

Safety flags
${item(n)}c, nothing met a threshold this visit but the pattern is worth watching.
`;

const doc = `SCHEDULE

Monday 1:00 PM — something
Thursday 9:00 AM — Skymo teaming: Fidelity form

2 family visits

\\----------------------------------------

${picked.map((f, n) => block(f, n + 1)).join("\n\\----------------------------------------\n\n")}
`;

const browser = await chromium.launch(
  process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}
);
const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
const page = await ctx.newPage();
page.on("pageerror", (e) => bad(`page error: ${String(e).slice(0, 140)}`));

/* Start from a clean shared board so counts mean what they say. */
await page.request.delete(`${BASE}/api/board`).catch(() => {});

await page.goto(`${BASE}/?date=${fx.todayIso}`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("#passcode:not([disabled])", { timeout: 20000 });
await page.fill("#passcode", process.env.SKYMO_PASSCODE);
await page.click('button[type="submit"]');
await page.waitForSelector(`text=${LONG[fx.today.getDay()]}`, { timeout: 30000 });

await page.click('button[aria-label="Add tasks"]');
await page.waitForSelector("#notes", { timeout: 8000 });
await page.fill("#notes", doc);
await page.waitForTimeout(700);

const sheet = await page.textContent('div[role], body');
check(/Reads as 3 families/.test(sheet), "the whole document is read as three families, not one");

for (const f of picked) {
  check(sheet.includes(f.name), `${f.name} is named in the review`);
}

/* 3 families x (2 before + 1 clinical + 1 safety) = 12 */
/* Scoped to the sheet: the screen behind it has its own "Add ..." buttons. */
const addBtn = page.locator('[data-noswipe] button').filter({ hasText: /^Add \d+$/ }).first();
const label = await addBtn.textContent();
check(/Add 12\b/.test(label || ""), `all twelve items came out (button says "${(label || "").trim()}")`);

await addBtn.click();
await page.waitForTimeout(1200);

/* The point of the whole exercise: the items are on the right families. */
for (const f of picked) {
  await page.click('button:has-text("Families")');
  await page.waitForTimeout(400);
  await page.click(`button:has-text("${f.name}")`);
  await page.waitForTimeout(600);
  const main = await page.textContent("main");
  const n = picked.indexOf(f) + 1;
  /* Three of this family's four carry the tag; the clinical-partner one is
     prose and deliberately does not, which is how we know prose survived. */
  const mine = countIn(main, new RegExp(`probe ${tag} item ${n}[abc]`, "gi"));
  check(mine >= 3, `${f.name} has its own three tagged items (found ${mine})`);
  check(has(main, `${item(n)}a`), `${f.name} got the item written for it, not another family's`);
  check(has(main, "Pacing of the piece"), `${f.name} got its prose clinical item too`);
  const others = picked.filter((x) => x !== f).map((x) => picked.indexOf(x) + 1);
  check(
    others.every((o) => !has(main, `${item(o)}a`)),
    `and none of the other families' items leaked onto ${f.name}`
  );
  check(/Safety/.test(main), `${f.name}'s safety flag is marked on the board`);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
}

/* Safety flags must arrive marked, and clinician items must reach teaming. */
await page.click('button:has-text("Day")');
await page.waitForTimeout(500);
await page.locator('button[aria-label="Open the teaming agenda"]').first().click();
await page.waitForSelector('input[aria-label="Add something to bring up at teaming"]', { timeout: 8000 });
const agenda = await page.textContent("main");
for (const f of picked) {
  const n = picked.indexOf(f) + 1;
  check(has(agenda, `${item(n)}c`), `${f.name}'s safety flag reached the teaming agenda`);
}
/* At least one per family. An item whose full sentence was trimmed for the
   title keeps the rest as a note, and the agenda shows both, so the raw count
   runs ahead of the number of items. */
check(
  countIn(agenda, /Pacing of the piece/g) >= picked.length,
  "and every family's prose clinical item is on it as well"
);

/* And it has to still be there after a reload, or it never really landed. */
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForSelector(`text=${LONG[fx.today.getDay()]}`, { timeout: 30000 });
await page.waitForTimeout(1500);
await page.click('button:has-text("Families")');
await page.waitForTimeout(400);
await page.click(`button:has-text("${picked[0].name}")`);
await page.waitForTimeout(600);
check(
  has(await page.textContent("main"), `${item(1)}a`),
  "the pasted items survive a reload, so they reached the shared board"
);

await browser.close();
console.log(log.join("\n"));
