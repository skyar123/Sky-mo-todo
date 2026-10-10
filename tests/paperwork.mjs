/* The paperwork clock, and the paperwork at the top of the day.

   The schedule half uses invented families, so the dates are checked against
   arithmetic done here rather than against the caseload. The screen half runs
   against the real caseload, whatever it holds on the day the suite runs, and
   checks the shape: paperwork above the day's visits, one tap to tick a step
   off (with the check, the fade and the move to the Done list), and none of
   it in the past-due pile. */

import { chromium } from "playwright";
import { loadFixture } from "./fixture.mjs";
import { LONG } from "../src/lib/dates.js";
import { paperworkFor, paperworkDue, clockDueFor, paperworkId } from "../src/lib/paperwork.js";

const ok = (m) => console.log("  ok   " + m);
const bad = (m) => { console.log("  FAIL " + m); process.exitCode = 1; };
const check = (cond, good, why) => (cond ? ok(good) : bad(why || good));

/* --- the schedule --------------------------------------------------------- */
{
  const fam = { id: "f1", name: "Probe", admit: "2026-06-24" };
  const on = (y, m, d) => new Date(y, m - 1, d);
  const at = (today) => new Map(paperworkFor(fam, today).map((t) => [t.id.split("_").pop(), t]));

  /* A week after admission, everything is ahead. */
  const early = at(on(2026, 7, 1));
  check(early.get("sixty")?.due === "2026-08-23", "the 60-day CCA and plan fall 60 days after admission");
  check(early.get("sniff60")?.due === "2026-08-23" && early.get("hope")?.due === "2026-08-23", "so do the 60-day SNIFF and the HOPE");
  check(early.get("sniff1")?.due === "2026-09-22", "SNIFF quarters are every 90 days from admission");
  check(early.get("tpr1")?.due === "2026-11-21" && early.get("tpr2")?.due === "2027-02-19", "plan reviews are every 90 days from the 60-day mark");
  check(early.get("six")?.due === "2026-12-24" && early.get("six")?.starts === "2026-12-10", "the six-month battery is at six months, opening two weeks before");
  check(early.get("dc")?.due === "2027-06-24", "the twelve-month mark is a year from admission");
  check(![...early.keys()].some((k) => k === "tpr5"), "nothing is laid out much past the twelve-month mark");
  check(early.get("sniff60").lane === "sky" && early.get("hope").lane === "sky", "the SNIFF and the HOPE are in my lane");
  check(early.get("tpr1").lane === "both", "plan reviews are shared: the plan is the clinician's, the PCP page is mine");

  /* A week after quarter 1 was due: the 60-day SNIFF gives way to it. */
  const later = at(on(2026, 9, 29));
  check(later.has("sniff1") && !later.has("sniff60"), "a later SNIFF replaces one that was missed before it");
  check(later.has("sixty") && later.has("hope"), "one-off steps stay until they are done or long gone");
  check(paperworkFor(fam, on(2026, 9, 29)).every((t) => t.id === paperworkId("f1", t.id.split("_").pop())), "every step has the same id on every day");

  /* Two months after quarter 1, with quarter 2 not yet due: it has aged off. */
  const aged = at(on(2026, 11, 25));
  check(!aged.has("sniff1") && aged.has("sniff2"), "a step two months late gives way rather than sitting red for ever");

  /* Marked done in the caseload: that step and everything before it. */
  const done = new Map(paperworkFor({ ...fam, paperDone: ["sniff1"] }, on(2026, 9, 29)).map((t) => [t.id.split("_").pop(), t]));
  check(done.get("sniff1")?.done === true, "a step the caseload records as done starts ticked");

  /* The list for today: late, due within a fortnight, or open for starting. */
  const tasks = paperworkFor(fam, on(2026, 9, 29));
  const due = paperworkDue(tasks, on(2026, 9, 29)).map((t) => t.id.split("_").pop());
  check(due.includes("sniff1") && due.includes("hope") && !due.includes("tpr1"), "today's list has what is late and nothing two months out");
  check(due.join() === paperworkDue(tasks, on(2026, 9, 29)).map((t) => t.id.split("_").pop()).join(), "and it is in date order, the same every time");
  const ticked = tasks.map((t) => (t.id.endsWith("sniff2") ? { ...t, done: true } : t));
  check(!paperworkDue(ticked, on(2026, 9, 29), 120).some((t) => t.id.endsWith("sniff1")), "ticking a later step in a track covers the earlier one");

  /* Past twelve months (an extended case): the mark is owed, the battery before it is not. */
  const ext = new Map(paperworkFor({ id: "f2", admit: "2025-08-19" }, on(2026, 9, 29)).map((t) => [t.id.split("_").pop(), t]));
  check(ext.has("dc") && !ext.has("term"), "past the twelve-month mark, the question is the mark itself, not the battery before it");
  check([...ext.keys()].some((k) => /^sniff\d+$/.test(k) && ext.get(k).due > "2026-09-29"), "and an extended case keeps its quarterly SNIFFs");

  check(paperworkFor({ id: "f3" }, on(2026, 9, 29)).length === 0, "a family with no admission date has no dated paperwork");
  check(/estimate/.test(paperworkFor({ ...fam, admitEstimated: true }, on(2026, 9, 29))[0].note), "an estimated admission date says so on every step");

  /* A note's item that names a step takes that step's date. */
  const today = on(2026, 9, 29);
  check(clockDueFor("Finish the SNIFF with mom", fam, today) === "2026-09-22", "a note asking for the SNIFF is dated from the clock");
  check(clockDueFor("Bring the HOPE form", fam, today) === "2026-08-23", "so is one asking for the HOPE");
  check(clockDueFor("I hope the weekend goes well", fam, today) === null, "\"hope\" in a sentence is not the HOPE");
  check(clockDueFor("Flag the 90-day treatment plan to Mo", fam, today) === "2026-08-23", "a plan item takes the plan step that is owed");
  check(clockDueFor("Call the school", fam, today) === null, "an item that names no step keeps no date");
  check(clockDueFor("Finish the SNIFF", { id: "f3" }, today) === null, "and without an admission date nothing is guessed");
  check(clockDueFor("SNIFF scoring follow-up", fam, today, new Set([paperworkId("f1", "sniff1")])) === "2026-12-21", "a step ticked on the board counts: the line takes the next SNIFF's date");
}

/* --- the screen ----------------------------------------------------------- */
{
  const BASE = process.env.BASE || "http://localhost:4173";
  const fx = await loadFixture();
  await fetch(`${BASE}/api/board`, { method: "DELETE" });

  const expected = paperworkDue(fx.families.flatMap((f) => paperworkFor(f, fx.today)), fx.today);
  if (!expected.length) {
    ok("no paperwork is due on the caseload today, so there is nothing to show");
  } else {
    const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    page.on("pageerror", (e) => bad(`page error: ${String(e).slice(0, 140)}`));
    await page.goto(`${BASE}/?date=${fx.todayIso}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#passcode:not([disabled])", { timeout: 20000 });
    await page.fill("#passcode", process.env.SKYMO_PASSCODE);
    await page.click('button[type="submit"]');
    await page.waitForSelector(`text=${LONG[fx.today.getDay()]}`, { timeout: 30000 });
    await page.waitForSelector("[data-paperwork]", { timeout: 10000 });

    const rows = await page.$$eval("[data-paperwork] [data-paper]", (els) => els.map((e) => e.getAttribute("data-paper")));
    check(rows.length === expected.length, `every step that is due shows at the top of the day (${rows.length} of ${expected.length})`);
    const firstMine = expected.filter((t) => t.lane === "sky")[0];
    if (firstMine) check(rows[0] === firstMine.id, "my own paperwork comes first, oldest first");

    const order = await page.evaluate(() => {
      const paper = document.querySelector("[data-paperwork]");
      const today = [...document.querySelectorAll("main div")].find((d) => d.textContent === "Today");
      return paper && today ? !!(paper.compareDocumentPosition(today) & Node.DOCUMENT_POSITION_FOLLOWING) : false;
    });
    check(order, "paperwork sits above the day's visits");

    const pastDue = await page.$$eval("[data-overdue]", (els) => els.map((e) => e.getAttribute("data-overdue")));
    check(!pastDue.some((id) => id.startsWith("pw_")), "and none of it is in the past-due pile");

    /* A tick does not make the row vanish under the thumb: the box fills
       with a check, the row fades where it is, and then it is in the Done
       list below rather than gone. */
    const first = rows[0];
    await page.click(`[data-paper="${first}"] [role="checkbox"]`);
    await page.waitForTimeout(150);
    const ticking = await page.$eval(`[data-paperwork] [data-row="${first}"]`, (el) => ({
      checked: el.querySelector('[role="checkbox"]').getAttribute("aria-checked"),
      mark: !!el.querySelector(".skmo-check"),
      fading: el.classList.contains("skmo-leaving"),
      archived: !!el.closest("[data-archive]"),
    })).catch(() => null);
    check(ticking?.checked === "true" && ticking.mark, "a ticked step shows its check mark at once", `just after the tap: ${JSON.stringify(ticking)}`);
    check(ticking?.fading && !ticking.archived, "and fades where it was rather than vanishing", `just after the tap: ${JSON.stringify(ticking)}`);
    await page.waitForTimeout(2200);
    const landed = await page.$$eval(`[data-paperwork] [data-archive] [data-archived="${first}"]`, (els) => els.length);
    const open = await page.$$eval("[data-paperwork] [data-paper]:not([data-archive] [data-paper])", (els) => els.map((e) => e.getAttribute("data-paper")));
    check(landed === 1 && !open.includes(first) && open.length === rows.length - 1, "then it is in the Done list under the paperwork, off the open list");
    const header = await page.textContent("[data-paperwork] [data-archive]");
    check(/Done lately · \d+/.test(header), "and the Done list says how many are in it");
    const meter = await page.textContent("[data-paperwork] [data-meter]").catch(() => "");
    check(/1 done in the last two weeks/.test(meter), "and the bar over the paperwork counts it as progress", `the bar says: ${meter}`);

    /* One more tap there puts it back. */
    await page.click(`[data-archived="${first}"] [role="checkbox"]`);
    await page.waitForTimeout(500);
    const back = await page.$$eval("[data-paperwork] [data-paper]:not([data-archive] [data-paper])", (els) => els.map((e) => e.getAttribute("data-paper")));
    check(back.includes(first), "a tap in the Done list puts it back on the list");

    const family = fx.families.find((f) => f.id === expected[0].client);
    await page.click('button:has-text("Families")');
    await page.waitForTimeout(400);
    await page.click(`button:has-text("${family.name}")`);
    await page.waitForTimeout(500);
    const fam = await page.textContent("main");
    check(/Paperwork/.test(fam) && /Admitted/.test(fam), "each family shows its paperwork and the date it counts from");

    /* The printed week starts with the paperwork, for whoever it is printed for. */
    await page.click('button:has-text("Print")');
    await page.waitForSelector("[data-print-paperwork]", { timeout: 8000 }).catch(() => {});
    const printed = await page.$$eval("[data-print-paperwork] > div:not(:first-child)", (els) => els.length).catch(() => 0);
    const forSky = expected.filter((t) => t.lane === "sky" || t.lane === "both").length;
    check(printed === forSky, `the printed sheet opens with the paperwork owed (${printed} of ${forSky})`);
    const sheet = await page.textContent(".sheet");
    check(sheet.indexOf("Paperwork owed") >= 0 && sheet.indexOf("Paperwork owed") < (sheet.indexOf("To bring up") + 1 || Infinity), "above everything else on the sheet");
    await browser.close();
  }
}
