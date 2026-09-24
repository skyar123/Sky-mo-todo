#!/usr/bin/env node
/* The last link: the weekly sweep writing onto the board with nobody present.

   The routine holds the passcode, so it can encrypt for the shared board the
   same way the two phones do. What has to be true is that what it writes is
   readable by the app, lands on the right families, and does not double if the
   routine runs twice.

   Family names come out of the encrypted caseload at runtime; the item text is
   invented. Nothing a client said is in this file. */

import { execFile } from "node:child_process";
import { writeFile, readFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { chromium } from "playwright";
import { loadFixture } from "./fixture.mjs";
import { LONG } from "../src/lib/dates.js";
import { decryptJSON, decryptWithKey, encryptWithKey } from "../src/lib/crypto.js";

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
