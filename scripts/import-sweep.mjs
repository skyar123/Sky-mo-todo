#!/usr/bin/env node
/* The weekly sweep, written straight onto the shared board.

   The board is encrypted with a key derived from the passcode, and the write
   token is derived from that same key, so the only thing that can add a task
   is something holding the passcode. That is the property that lets a caseload
   live on a public host at all, and it is why this step cannot happen on the
   server: the server has never been able to read a word of it.

   So the routine does it. It already reads every visit note in full, so the
   passcode does not widen what it can see, only what it can write. It reads
   the passcode from SKYMO_PASSCODE and writes nowhere else.

   Run as:  node import-sweep.mjs <doc.txt> [--dry] [--endpoint URL]

   Ids are derived from the family and the task text, so running twice adds
   nothing the second time. That matters more than it sounds: a routine that
   doubles the board on a retry is worse than one that does not run. */

import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { decryptJSON, decryptWithKey, encryptWithKey } from "../src/lib/crypto.js";
import { writeToken } from "../src/lib/sync.js";
import { mergeShared } from "../src/lib/shared.js";
import { extractFromDoc, itemsToTasks } from "../src/lib/extract.js";

const TAKES_VALUE = new Set(["--site", "--endpoint", "--caseload"]);
const opts = {};
const loose = [];
for (let i = 0; i < process.argv.length - 2; i++) {
  const a = process.argv[i + 2];
  if (TAKES_VALUE.has(a)) { opts[a] = process.argv[i + 3]; i++; continue; }
  if (a.startsWith("--")) { opts[a] = true; continue; }
  loose.push(a);
}

const SITE = opts["--site"] || "https://sky-mo-caseload.netlify.app";
const ENDPOINT = opts["--endpoint"] || `${SITE}/api/board`;
const CASELOAD = opts["--caseload"] || `${SITE}/caseload.enc.json`;
const DRY = !!opts["--dry"];
const RETRIES = 4;

const docPath = loose[0];
if (!docPath) {
  console.error("usage: node import-sweep.mjs <doc.txt> [--dry] [--site URL]");
  process.exit(2);
}

const passcode = process.env.SKYMO_PASSCODE;
if (!passcode) {
  console.error("SKYMO_PASSCODE is not set. Nothing was written.");
  process.exit(2);
}

const text = await readFile(docPath, "utf8");

/* The caseload is the same encrypted payload the app loads, so the families
   and their aliases are read from the one place that holds them. */
const encRes = await fetch(CASELOAD, { cache: "no-store" });
if (!encRes.ok) throw new Error(`could not read the caseload: ${encRes.status}`);
const enc = await encRes.json();
const { data, key } = await decryptJSON(enc, passcode);
const families = data.families;
const salt = enc.salt;

const { items, families: spread } = extractFromDoc(text, { families, today: new Date() });
if (!items.length) {
  console.log("No follow-up items in that document. Nothing written.");
  process.exit(0);
}

/* Same id for the same item, so a second run is a no-op rather than a double. */
const idFor = (t) =>
  "sweep_" + createHash("sha256").update(`${t.client || "none"}|${t.text}`).digest("hex").slice(0, 16);

const tasks = itemsToTasks(items, { client: null }).map((t) => ({ ...t, id: idFor(t) }));

const named = new Map();
for (const t of tasks) {
  const f = t.client ? families.find((x) => x.id === t.client) : null;
  const k = f ? f.name : "no family";
  named.set(k, (named.get(k) || 0) + 1);
}

console.log(`${tasks.length} item(s) across ${spread} block(s):`);
for (const [k, n] of named) console.log(`   ${k}: ${n}`);
const unplaced = tasks.filter((t) => !t.client).length;
if (unplaced) console.log(`   ${unplaced} could not be matched to a family and will need one picked by hand`);

if (DRY) {
  console.log("--dry: nothing written.");
  process.exit(0);
}

const token = await writeToken(key);
const stamp = Date.now();

/* Optimistic, exactly as the app does it: read, add only what is missing,
   write against the revision we read, and start over if someone beat us. */
let added = 0;
let skipped = 0;
let wrote = false;

for (let attempt = 0; attempt < RETRIES; attempt++) {
  const res = await fetch(ENDPOINT, { cache: "no-store" });
  if (!res.ok) throw new Error(`pull ${res.status}`);
  const { rev, blob } = await res.json();
  const remote = blob ? await decryptWithKey(JSON.parse(blob), key) : null;

  const mine = { v: 1, tasks: {}, sent: {}, supplies: {}, drops: {} };
  added = 0;
  skipped = 0;
  for (const t of tasks) {
    const existing = remote?.tasks?.[t.id];
    /* Already there, or deliberately deleted since. Either way, leave it. */
    if (existing) { skipped++; continue; }
    mine.tasks[t.id] = { seed: false, task: t, updatedAt: stamp, by: "sweep" };
    added++;
  }

  if (!added) {
    console.log(`Nothing new: all ${skipped} item(s) are already on the board.`);
    process.exit(0);
  }

  const merged = remote ? mergeShared(remote, mine) : mine;
  const payload = await encryptWithKey(merged, key, salt);
  const put = await fetch(ENDPOINT, {
    method: "PUT",
    headers: { "content-type": "application/json", "x-skymo-token": token },
    body: JSON.stringify({ rev, blob: JSON.stringify(payload) }),
  });
  if (put.status === 409) continue;   // someone wrote first; read again
  if (!put.ok) throw new Error(`push ${put.status}`);
  const out = await put.json();
  console.log(`Added ${added} item(s) to the board (revision ${rev} -> ${out.rev}).`);
  if (skipped) console.log(`${skipped} were already there and were left alone.`);
  wrote = true;
  break;
}

if (!wrote) {
  console.error("The board kept changing under us. Nothing was written; try again.");
  process.exit(1);
}
