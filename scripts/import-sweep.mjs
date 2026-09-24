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
/* The families and their names come from the copy of the caseload that sits
   beside this script, not from the deployed site. They used to come from the
   site, which meant a name added to the caseload did nothing for the sweep
   until the next deploy; and a deploy can be stuck for days. The routine
   clones this repository fresh on every run, so reading the file next door
   means a new name reaches the sweep the moment it is committed. Passing
   --caseload (a URL or a path) still overrides it. */
const CASELOAD = opts["--caseload"] || (opts["--site"] ? `${SITE}/caseload.enc.json` : null);
const LOCAL_CASELOAD = new URL("../public/caseload.enc.json", import.meta.url);
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
   and their names are read from the one file that holds them. */
async function loadCaseload() {
  if (CASELOAD && /^https?:\/\//.test(CASELOAD)) {
    const res = await fetch(CASELOAD, { cache: "no-store" });
    if (!res.ok) throw new Error(`could not read the caseload: ${res.status}`);
    return res.json();
  }
  return JSON.parse(await readFile(CASELOAD || LOCAL_CASELOAD, "utf8"));
}
const enc = await loadCaseload();
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
let adopted = 0;
let wrote = false;

for (let attempt = 0; attempt < RETRIES; attempt++) {
  const res = await fetch(ENDPOINT, { cache: "no-store" });
  if (!res.ok) throw new Error(`pull ${res.status}`);
  const { rev, blob } = await res.json();

  /* The caseload is now read from the repository rather than the site, so
     it is possible, in principle, for the two to disagree about the key. If
     this key cannot open the board, writing would replace everyone's work
     with a board nobody's phone can read. Stop instead. */
  let remote = null;
  if (blob) {
    try {
      remote = await decryptWithKey(JSON.parse(blob), key);
    } catch {
      console.error(
        "The shared board cannot be opened with this caseload's key, so nothing was written.\n" +
          "The caseload in the repository and the one on the site no longer match."
      );
      process.exit(1);
    }
  }

  const mine = { v: 1, tasks: {}, sent: {}, supplies: {}, drops: {} };
  added = 0;
  skipped = 0;
  adopted = 0;
  for (const t of tasks) {
    const existing = remote?.tasks?.[t.id];
    /* Already there, or deliberately deleted since. Either way, leave it. */
    if (existing) { skipped++; continue; }
    mine.tasks[t.id] = { seed: false, task: t, updatedAt: stamp, by: "sweep" };
    added++;

    /* The same item, imported earlier before its family's name was known,
       sits on the board with no family. The id comes from the family and the
       text, so the correctly placed one is a new id and the stranded one would
       stay behind as a duplicate on the "not tied to a family" screen. Retire
       it. Only a copy that nobody has touched since the sweep wrote it: once
       someone has ticked it or given it a family by hand, it is theirs. */
    if (t.client) {
      const strandedId = idFor({ ...t, client: null });
      const stranded = remote?.tasks?.[strandedId];
      const untouched = stranded && !stranded.deleted && stranded.by === "sweep" && !stranded.task?.done && !stranded.task?.client;
      if (untouched) {
        mine.tasks[strandedId] = { deleted: true, updatedAt: stamp };
        adopted++;
      }
    }
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
  if (adopted) console.log(`${adopted} of them had been sitting with no family from an earlier sweep; moved to their family.`);
  if (skipped) console.log(`${skipped} were already there and were left alone.`);
  wrote = true;
  break;
}

if (!wrote) {
  console.error("The board kept changing under us. Nothing was written; try again.");
  process.exit(1);
}
