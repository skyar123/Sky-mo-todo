#!/usr/bin/env node
/* Take back what the sweep added since a given moment, so it can be read again.

   For when a sweep went wrong: the same notes read several times over, each
   time coming out a little differently, and the board holding all of the
   versions. This retires the sweep's items from that stretch, and only the
   ones nobody has touched. Anything ticked, edited, moved or handed over is
   someone's work and stays exactly as it is.

   Retired items are marked as retired by the sweep rather than by a person,
   so when the notes are read again the correct items come back. A deletion a
   person made is never undone by that.

   Run as:  node retire-sweep.mjs --since 2026-09-24T00:00:00Z [--dry] [--site URL]

   Also forgets which notes were read in that stretch, so the next sweep reads
   them again instead of skipping them as already done. */

import { readFile } from "node:fs/promises";
import { decryptJSON, decryptWithKey, encryptWithKey } from "../src/lib/crypto.js";
import { writeToken } from "../src/lib/sync.js";
import { mergeShared } from "../src/lib/shared.js";

const opts = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (["--since", "--site", "--caseload"].includes(a)) { opts[a] = process.argv[++i]; continue; }
  if (a.startsWith("--")) opts[a] = true;
}

const since = Date.parse(opts["--since"] || "");
if (!Number.isFinite(since)) {
  console.error("usage: node retire-sweep.mjs --since <ISO time> [--dry] [--site URL]");
  process.exit(2);
}
const passcode = process.env.SKYMO_PASSCODE;
if (!passcode) {
  console.error("SKYMO_PASSCODE is not set. Nothing was written.");
  process.exit(2);
}

const SITE = opts["--site"] || "https://sky-mo-caseload.netlify.app";
const ENDPOINT = `${SITE}/api/board`;
/* The key comes from the same place import-sweep takes it from, so the two
   can never disagree about which board they are opening: --caseload if given,
   the site's copy when pointed at another site, the repository's otherwise. */
const CASELOAD = opts["--caseload"] || (opts["--site"] ? `${SITE}/caseload.enc.json` : null);
const enc = CASELOAD && /^https?:\/\//.test(CASELOAD)
  ? await (await fetch(CASELOAD, { cache: "no-store" })).json()
  : JSON.parse(await readFile(CASELOAD || new URL("../public/caseload.enc.json", import.meta.url), "utf8"));
const { key } = await decryptJSON(enc, passcode);

const res = await fetch(ENDPOINT, { cache: "no-store" });
if (!res.ok) throw new Error(`pull ${res.status}`);
const { rev, blob } = await res.json();
if (!blob) {
  console.log("The board is empty. Nothing to do.");
  process.exit(0);
}
let remote;
try {
  remote = await decryptWithKey(JSON.parse(blob), key);
} catch {
  console.error("The board cannot be opened with this caseload's key. Nothing was written.");
  process.exit(1);
}

const stamp = Date.now();
const mine = { v: 1, tasks: {}, sent: {}, supplies: {}, drops: {} };
let retired = 0;
let spared = 0;
let forgotten = 0;

for (const [id, e] of Object.entries(remote.tasks || {})) {
  if (!e || (e.updatedAt || 0) < since) continue;

  /* A note read in this stretch: forget it, so it is read again. */
  if (id.startsWith("src_") && e.source) {
    mine.tasks[id] = { deleted: true, updatedAt: stamp, by: "sweep" };
    forgotten++;
    continue;
  }

  if (!id.startsWith("sweep_") || e.deleted) continue;
  if (e.by === "sweep" && !e.task?.done) {
    mine.tasks[id] = { deleted: true, updatedAt: stamp, by: "sweep" };
    retired++;
  } else {
    spared++;
  }
}

console.log(`Since ${new Date(since).toISOString()}:`);
console.log(`   ${retired} sweep item(s) nobody has touched, to retire`);
console.log(`   ${spared} someone has ticked or changed, left alone`);
console.log(`   ${forgotten} note(s) to read again`);

if (opts["--dry"] || (!retired && !forgotten)) {
  console.log(opts["--dry"] ? "--dry: nothing written." : "Nothing to do.");
  process.exit(0);
}

const merged = mergeShared(remote, mine);
const payload = await encryptWithKey(merged, key, enc.salt);
const put = await fetch(ENDPOINT, {
  method: "PUT",
  headers: { "content-type": "application/json", "x-skymo-token": await writeToken(key) },
  body: JSON.stringify({ rev, blob: JSON.stringify(payload) }),
});
if (put.status === 409) {
  console.error("The board changed while this was running. Nothing was written; run it again.");
  process.exit(1);
}
if (!put.ok) throw new Error(`push ${put.status}`);
console.log(`Done (revision ${rev} -> ${(await put.json()).rev}).`);
