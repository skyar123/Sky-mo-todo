#!/usr/bin/env node
/* The last link: the weekly sweep writing onto the board with nobody present.

   The routine holds the passcode, so it can encrypt for the shared board the
   same way the two phones do. What has to be true is that what it writes is
   readable by the app, lands on the right families, and does not double if the
   routine runs twice.

   Family names come out of the encrypted caseload at runtime; the item text is
   invented. Nothing a client said is in this file. */

import { execFile } from "node:child_process";
import { writeFile, readFile, mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { chromium } from "playwright";
import { loadFixture } from "./fixture.mjs";
import { LONG } from "../src/lib/dates.js";
import { decryptJSON, decryptWithKey, encryptWithKey } from "../src/lib/crypto.js";
import { writeToken } from "../src/lib/sync.js";

const run = promisify(execFile);
const BASE = process.env.BASE || "http://localhost:4173";
const fx = await loadFixture();

const ok = (m) => console.log("  ok   " + m);
const bad = (m) => { console.log("  FAIL " + m); process.exitCode = 1; };
const check = (cond, good, why) => (cond ? ok(good) : bad(why || good));

const picked = fx.families.filter((f) => f.alias?.length).slice(0, 2);
const tag = Date.now().toString().slice(-5);
const item = (n) => `sweep ${tag} item ${n}`;
const has = (hay, needle) => hay.toLowerCase().includes(needle.toLowerCase());

const doc = `SCHEDULE

Monday 1:00 PM — something

2 family visits

\\----------------------------------------

${picked
  .map(
    (f, i) => `${f.alias[0]}: Visit Notes

Before next visit
☐
${item(i + 1)}a, and a clause after it so the line is worth keeping.

Bring to the clinical partner
${item(i + 1)}b, the pacing question and whose part is whose next time.

Safety flags
${item(i + 1)}c, nothing met a threshold but the pattern is worth watching.
`
  )
  .join("\n\\----------------------------------------\n\n")}
`;

const dir = await mkdtemp(path.join(tmpdir(), "skymo-import-"));
const file = path.join(dir, "doc.txt");
await writeFile(file, doc);

/* A clean board, so the counts mean what they say. */
await fetch(`${BASE}/api/board`, { method: "DELETE" });

const importer = ["scripts/import-sweep.mjs", file, "--site", BASE];
const env = { ...process.env, SKYMO_PASSCODE: process.env.SKYMO_PASSCODE };

const dry = await run("node", [...importer, "--dry"], { env });
check(/6 item\(s\) across 2 block\(s\)/.test(dry.stdout), "a dry run reports what it would write and writes nothing");
for (const f of picked) check(has(dry.stdout, `${f.name}: 3`), `${f.name} gets three of them`);

const before = (await (await fetch(`${BASE}/api/board`)).json()).rev;
const first = await run("node", importer, { env });
check(/Added 6 item\(s\)/.test(first.stdout), "the sweep writes six items onto the board");
const after = (await (await fetch(`${BASE}/api/board`)).json()).rev;
check(after > before, `and the board moved (revision ${before} -> ${after})`);

/* Run it again. A routine that doubles the board on a retry is worse than one
   that does not run, so this is the assertion that matters most. */
const second = await run("node", importer, { env });
check(/Nothing new: all 6 item\(s\) are already on the board/.test(second.stdout), "running it twice adds nothing");
const third = (await (await fetch(`${BASE}/api/board`)).json()).rev;
check(third === after, `and does not even write (revision still ${after})`);

/* A note headed by a name the caseload does not know yet. This is what
   happened with a family's filler nickname and with a child's name spelled
   differently from the caseload: the items landed with no family. Then the
   name is added, the next sweep reads the same note again, and there must be
   exactly one copy of each item afterwards, under the right family. Not the
   stranded one, not both.

   The name is invented and unique to this run. The caseload used for the
   second run is written to a temporary file still encrypted, with the same
   salt, so it opens the same board. */
{
  const stranger = `Marigold${tag}`;
  const strandedText = `${item(9)}a, a clause after it so the line is worth keeping.`;
  const strandFile = path.join(dir, "stranded.txt");
  await writeFile(strandFile, `${stranger}: Visit Notes\n\nBefore next visit\n☐\n${strandedText}\n`);

  const firstPass = await run("node", ["scripts/import-sweep.mjs", strandFile, "--site", BASE], { env });
  check(/could not be matched to a family/.test(firstPass.stdout), "a note under an unknown name is reported as unplaced, not dropped");

  const enc = JSON.parse(await readFile(new URL("../public/caseload.enc.json", import.meta.url), "utf8"));
  const { key, data } = await decryptJSON(enc, process.env.SKYMO_PASSCODE);
  const home = picked[0];
  const taught = {
    ...data,
    families: data.families.map((f) => (f.id === home.id ? { ...f, titleAlias: [...(f.titleAlias || []), stranger.toLowerCase()] } : f)),
  };
  const taughtFile = path.join(dir, "caseload.enc.json");
  await writeFile(
    taughtFile,
    JSON.stringify({ ...(await encryptWithKey(taught, key, enc.salt)), kdf: enc.kdf, iter: enc.iter })
  );

  const secondPass = await run(
    "node",
    ["scripts/import-sweep.mjs", strandFile, "--site", BASE, "--caseload", taughtFile],
    { env }
  );
  check(/moved to their family/.test(secondPass.stdout), "once the name is known, the next sweep moves the stranded item to its family");

  const { blob } = await (await fetch(`${BASE}/api/board`)).json();
  const board = await decryptWithKey(JSON.parse(blob), key);
  const copies = Object.values(board.tasks).filter((e) => e && !e.deleted && e.task && has(e.task.text, `${item(9)}a`));
  check(copies.length === 1, "and leaves exactly one copy, not the stranded one as well", `found ${copies.length} copies`);
  check(copies[0]?.task.client === home.id, `and that copy is under ${home.name}`);

  const thirdPass = await run(
    "node",
    ["scripts/import-sweep.mjs", strandFile, "--site", BASE, "--caseload", taughtFile],
    { env }
  );
  check(/Nothing new/.test(thirdPass.stdout), "and a further sweep of the same note changes nothing");
}

/* --- the sweep reading notes straight from Drive -------------------------

   The routine now copies each note's text as Drive gives it and lets this
   script decide what is an item. What has to hold, and what did not hold when
   the routine did the extracting itself:

   - a note is read once per version, however many runs see it;
   - a second copy of the same version whose text came out a little
     differently adds nothing (that variation put forty extra items on the
     real board in one night);
   - an edited note replaces what its last version added, except anything a
     person has ticked or changed.

   The notes are invented, in Drive's export shape. */
{
  /* Families of its own. A newer tracked visit note makes a family's older
     sweep items step back into "From earlier visits", which is right, but it
     would hide the items the test above checks for on its families. */
  const [one, two] = fx.families.filter((f) => f.alias?.length && !picked.includes(f)).slice(0, 2);
  const notes = path.join(dir, "notes");
  await mkdir(notes, { recursive: true });
  const visit = (items, supervision = true) => [
    `${one.alias[0]}: Visit Notes, week of 2026-09-14`,
    "",
    "1\\. The Visit",
    "",
    "Narrative that belongs in the note and not on the board, long enough to be tempting.",
    "",
    "5\\. Follow-Up",
    "",
    "|  |  |",
    "| :-: | :-: |",
    ...items.map((t) => `| ☐ | ${t} |`),
    "",
    "Safety flags: none disclosed in this memo.",
    "",
    "6\\. Open Threads and Supervision",
    "",
    ...(supervision ? [`ð¥ \\[team\\] ${item(20)} team question for Thursday, long enough to keep.`] : []),
  ].join("\n");
  const prep = [
    "Reflective Supervision Prep: Week of 2026-09-14",
    "",
    "11\\. Logistics (capped at 20%)",
    "",
    "|  |  |",
    "| :-: | :-: |",
    `| ☐ | ${two.alias[0]} mom: ${item(30)} therapist-list follow-up, offer to call together. |`,
  ].join("\n");

  const A = `${item(21)} confirm the reassessment timing for the speech question.`;
  const B = `${item(22)} tell Mo about the ending and propose a slower goodbye.`;
  const B2 = `${item(22)} tell Mo about the ending, and plan the ten-minute landing together.`;

  const write = (name, source, text) => writeFile(path.join(notes, name), `Source: ${source}\n${text}\n`);
  await write("a.txt", `driveA${tag} | 2026-09-23T04:00:00Z | ${one.alias[0]} Visit Notes 2026-09-23.docx`, visit([A, B]));
  await write("b.txt", `driveB${tag} | 2026-09-19T21:20:01Z | Supervision Prep Week of 2026-09-14.docx`, prep);

  const sweep = (...extra) => run("node", ["scripts/import-sweep.mjs", "--notes", notes, "--site", BASE, ...extra], { env });
  const boardNow = async () => {
    const enc = JSON.parse(await readFile(new URL("../public/caseload.enc.json", import.meta.url), "utf8"));
    const { key } = await decryptJSON(enc, process.env.SKYMO_PASSCODE);
    const b = await (await fetch(`${BASE}/api/board`)).json();
    return { rev: b.rev, key, salt: enc.salt, doc: await decryptWithKey(JSON.parse(b.blob), key) };
  };
  const live = (doc, needle) =>
    Object.entries(doc.tasks).filter(([, e]) => e && !e.deleted && e.task && has(e.task.text, needle));

  const first = await sweep();
  check(/Added 4 item\(s\)/.test(first.stdout), "two notes read from Drive put their four items on the board", first.stdout.trim());
  let b0 = await boardNow();
  check(live(b0.doc, `${item(21)}`)[0]?.[1].task.client === one.id, `the visit note's items are filed under ${one.name}, from its title`);
  check(live(b0.doc, `${item(30)}`)[0]?.[1].task.client === two.id, `the prep's labelled line is filed under ${two.name}`);
  const team = live(b0.doc, `${item(20)}`)[0]?.[1].task;
  check(team?.forum === "team" && team.agenda && team.kind !== "supervision", "the [team] line arrives on the teaming list");

  const again = await sweep();
  check(/Nothing new: 2 note\(s\) already read/.test(again.stdout), "reading the same notes again adds nothing");

  /* The failure that happened for real: the same version of the note, copied
     out with slightly different words. */
  await write("a.txt", `driveA${tag} | 2026-09-23T04:00:00Z | ${one.alias[0]} Visit Notes 2026-09-23.docx`, visit([A, B2]));
  const variant = await sweep();
  const b1 = await boardNow();
  check(/Nothing new/.test(variant.stdout) && b1.rev === b0.rev, "a differently worded copy of the same version adds nothing and writes nothing");
  check(live(b1.doc, `${item(22)}`).length === 1, "so there is still exactly one copy of each item");

  /* Someone ticks item A on their phone. */
  const aId = live(b1.doc, `${item(21)}`)[0][0];
  const ticked = structuredClone(b1.doc);
  ticked.tasks[aId] = { ...ticked.tasks[aId], task: { ...ticked.tasks[aId].task, done: true }, by: "sky", updatedAt: Date.now() };
  const put = await fetch(`${BASE}/api/board`, {
    method: "PUT",
    headers: { "content-type": "application/json", "x-skymo-token": await writeToken(b1.key) },
    body: JSON.stringify({ rev: b1.rev, blob: JSON.stringify(await encryptWithKey(ticked, b1.key, b1.salt)) }),
  });
  check(put.ok, "(a person ticks one of the note's items)");

  /* Then the note is edited: A is gone from it, B is reworded. */
  await write("a.txt", `driveA${tag} | 2026-09-24T02:00:00Z | ${one.alias[0]} Visit Notes 2026-09-23.docx`, visit([B2]));
  const edited = await sweep();
  const b2 = await boardNow();
  check(/retired/.test(edited.stdout), "an edited note replaces what its last version added");
  /* Checked against the full wording: the title is shortened for the phone,
     and the rest is kept in the item's note. */
  const reworded = live(b2.doc, `${item(22)}`);
  const full = (t) => `${t.text} ${t.note || ""}`;
  check(reworded.length === 1 && has(full(reworded[0][1].task), "landing"), "the reworded item replaces the old wording, not beside it");
  check(live(b2.doc, `${item(21)}`)[0]?.[1].task.done === true, "but the item someone ticked stays, even though the note no longer has it");
  check(live(b2.doc, `${item(30)}`).length === 1, "and the other note is untouched");

  /* From review: two notes can ask for the same thing. An edit that drops
     the line from one must not retire it while the other still has it. */
  const SHARED = `${item(40)} send mom the resource list we talked about.`;
  await write("c.txt", `driveC${tag} | 2026-09-22T05:00:00Z | ${one.alias[0]} Visit Notes 2026-09-22.docx`, visit([SHARED], false));
  await write("a.txt", `driveA${tag} | 2026-09-24T03:00:00Z | ${one.alias[0]} Visit Notes 2026-09-23.docx`, visit([B2, SHARED]));
  await sweep();
  const b3 = await boardNow();
  check(live(b3.doc, `${item(40)}`).length === 1, "a line two notes share is on the board once");
  check(
    live(b3.doc, `${item(40)}`)[0]?.[1].task.noted === "2026-09-23",
    "and belongs to the newer of the two notes, so it is never taken for an earlier visit's leftover"
  );
  await write("a.txt", `driveA${tag} | 2026-09-24T04:00:00Z | ${one.alias[0]} Visit Notes 2026-09-23.docx`, visit([B2]));
  await sweep();
  const b4 = await boardNow();
  check(live(b4.doc, `${item(40)}`).length === 1, "dropping it from one note keeps it while the other note still asks for it");

  /* From review: an item imported before notes were tracked has no visit
     date, which reads as older than every tracked note. When a newer note
     repeats it word for word, it has to take that note's date, or the
     current visit's own item gets folded away as a leftover. */
  const LEGACY = `${item(50)} bring the sticker chart and the timer.`;
  const legacyFile = path.join(dir, "legacy.txt");
  await writeFile(legacyFile, `${one.alias[0]}: Visit Notes\n\nBefore next visit\n☐\n${LEGACY}\n`);
  await run("node", ["scripts/import-sweep.mjs", legacyFile, "--site", BASE], { env });
  const b5 = await boardNow();
  check(!live(b5.doc, `${item(50)}`)[0]?.[1].task.noted, "(an item arrives the old way, with no visit date)");
  await write("d.txt", `driveD${tag} | 2026-09-25T01:00:00Z | ${one.alias[0]} Visit Notes 2026-09-25.docx`, visit([LEGACY], false));
  await sweep();
  const b6 = await boardNow();
  const legacyNow = live(b6.doc, `${item(50)}`);
  check(legacyNow.length === 1 && legacyNow[0][1].task.noted === "2026-09-25", "a newer note repeating it gives it that note's date instead of adding a copy");

  /* A line someone has ticked, read again in new words. Item ids come from
     the title, so a parser fix that trims titles differently (or a small
     edit to the note) gives the same line a new id. Untouched, the old one
     is simply replaced; ticked, it must not come back open beside it. */
  const GROW = `${item(60)} email the school counselor about the meeting.`;
  const GROWN = `${item(60)} email the school counselor about the meeting and the bus plan.`;
  const UNTOUCHED = `${item(61)} print the visual schedule for the fridge.`;
  const UNTOUCHED2 = `${item(61)} print the visual schedule for the fridge and the car.`;
  await write("e.txt", `driveE${tag} | 2026-09-26T01:00:00Z | ${two.alias[0]} Visit Notes 2026-09-26.docx`, visit([GROW, UNTOUCHED], false));
  await sweep();
  const b7 = await boardNow();
  const growId = live(b7.doc, `${item(60)}`)[0]?.[0];
  const tick7 = structuredClone(b7.doc);
  tick7.tasks[growId] = { ...tick7.tasks[growId], task: { ...tick7.tasks[growId].task, done: true }, by: "mo", updatedAt: Date.now() };
  const put7 = await fetch(`${BASE}/api/board`, {
    method: "PUT",
    headers: { "content-type": "application/json", "x-skymo-token": await writeToken(b7.key) },
    body: JSON.stringify({ rev: b7.rev, blob: JSON.stringify(await encryptWithKey(tick7, b7.key, b7.salt)) }),
  });
  check(put7.ok, "(the other person ticks a line)");
  await write("e.txt", `driveE${tag} | 2026-09-26T02:00:00Z | ${two.alias[0]} Visit Notes 2026-09-26.docx`, visit([GROWN, UNTOUCHED2], false));
  await sweep();
  const b8 = await boardNow();
  const grown = live(b8.doc, `${item(60)}`);
  check(grown.length === 1 && grown[0][0] === growId && grown[0][1].task.done === true, "a ticked line read again in new words stays ticked, and is not added a second time open");
  const redone = live(b8.doc, `${item(61)}`);
  check(redone.length === 1 && has(redone[0][1].task.text, "the car"), "an untouched one is replaced by the new wording");
  const ledger8 = Object.values(b8.doc.tasks).find((e) => e?.source?.id === `driveE${tag}`);
  check(ledger8?.source.items.includes(growId), "and the note's record still counts the ticked line as its own");
}

/* Now the half that matters to a person: is it there when the app opens? */
const browser = await chromium.launch(
  process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}
);
const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
const page = await ctx.newPage();
page.on("pageerror", (e) => bad(`page error: ${String(e).slice(0, 140)}`));

await page.goto(`${BASE}/?date=${fx.todayIso}`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("#passcode:not([disabled])", { timeout: 20000 });
await page.fill("#passcode", process.env.SKYMO_PASSCODE);
await page.click('button[type="submit"]');
await page.waitForSelector(`text=${LONG[fx.today.getDay()]}`, { timeout: 30000 });

/* The board arrives on the first sync after unlocking, not with the page, so
   wait for it rather than guessing how long that takes. */
const waitForText = (needle) =>
  page
    .waitForFunction(
      (t) => document.querySelector("main")?.innerText.toLowerCase().includes(t),
      needle.toLowerCase(),
      { timeout: 20000 }
    )
    .then(() => true, () => false);

for (const f of picked) {
  const n = picked.indexOf(f) + 1;
  await page.click('button:has-text("Families")');
  await page.waitForTimeout(400);
  await page.click(`button:has-text("${f.name}")`);
  const landed = await waitForText(`${item(n)}a`);
  const main = await page.textContent("main");
  check(landed && has(main, `${item(n)}a`), `${f.name} has the item the sweep wrote for it`);
  const others = picked.filter((x) => x !== f).map((x) => picked.indexOf(x) + 1);
  check(
    others.every((o) => !has(main, `${item(o)}a`)),
    `and none of the other family's items landed on ${f.name}`
  );
  check(/Safety/.test(main), `${f.name}'s safety flag arrived marked`);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
}

await page.click('button:has-text("Day")');
await page.waitForTimeout(500);
await page.locator('button[aria-label="Open the teaming agenda"]').first().click();
await page.waitForSelector('input[aria-label="Add something to bring up at teaming"]', { timeout: 8000 });
const agenda = await page.textContent("main");
for (const f of picked) {
  const n = picked.indexOf(f) + 1;
  check(has(agenda, `${item(n)}b`), `${f.name}'s clinician item reached the teaming agenda`);
}

/* And it is the other person's board too: shown as arriving from elsewhere. */
check(
  await page.locator('button:has-text("Families")').isVisible(),
  "the board is usable after a sweep wrote to it underneath"
);

await browser.close();
