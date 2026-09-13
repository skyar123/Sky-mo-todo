#!/usr/bin/env node
/* What got finished, read back off the board.

   The app is all forward pressure: what is left, what is due, what is next.
   Nothing in it remembers what a week actually held, and the routine that
   fills the board each Saturday had no way to know what became of last
   week's items. So before it brings in the new week it reads the old one.

   Prints a plain list. The routine puts it in a Google Doc; nothing here
   writes anywhere.

   Run as:  node report-done.mjs [--days 7] [--site URL]
*/

import { decryptJSON, decryptWithKey } from "../src/lib/crypto.js";
import { fromShared } from "../src/lib/shared.js";

const TAKES_VALUE = new Set(["--site", "--endpoint", "--caseload", "--days"]);
const opts = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (TAKES_VALUE.has(a)) { opts[a] = process.argv[++i]; continue; }
  if (a.startsWith("--")) opts[a] = true;
}

const SITE = opts["--site"] || "https://sky-mo-caseload.netlify.app";
const ENDPOINT = opts["--endpoint"] || `${SITE}/api/board`;
const CASELOAD = opts["--caseload"] || `${SITE}/caseload.enc.json`;
const DAYS = Number(opts["--days"] || 7);

const passcode = process.env.SKYMO_PASSCODE;
if (!passcode) {
  console.error("SKYMO_PASSCODE is not set.");
  process.exit(2);
}

const enc = await (await fetch(CASELOAD, { cache: "no-store" })).json();
const { data, key } = await decryptJSON(enc, passcode);

const res = await (await fetch(ENDPOINT, { cache: "no-store" })).json();
if (!res.blob) {
  console.log("The board is empty. Nothing to report.");
  process.exit(0);
}
const doc = await decryptWithKey(JSON.parse(res.blob), key);
const { tasks } = fromShared(doc, data.seedTasks || []);

const since = Date.now() - DAYS * 86400000;
const done = tasks
  .filter((t) => t.done && (t.updatedAt || 0) >= since)
  .sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0));

const open = tasks.filter((t) => !t.done);
const name = (id) => (id ? data.families.find((f) => f.id === id)?.name : null) || "Not tied to a family";
const day = (at) => new Date(at).toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric" });

console.log(`DONE IN THE LAST ${DAYS} DAYS`);
console.log("");

if (!done.length) {
  console.log("Nothing was ticked off.");
} else {
  const groups = new Map();
  for (const t of done) {
    const k = name(t.client);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(t);
  }
  for (const [fam, rows] of [...groups].sort()) {
    console.log(`${fam} (${rows.length})`);
    for (const t of rows) {
      const marks = [t.urgent ? "safety" : null, t.agenda ? "clinician" : null, t.important ? "must cover" : null]
        .filter(Boolean)
        .join(", ");
      console.log(`  ${day(t.updatedAt)}  ${t.text}${marks ? `  [${marks}]` : ""}`);
    }
    console.log("");
  }
}

console.log(`${done.length} finished, ${open.length} still open.`);

/* What is still open and was flagged is the part worth carrying forward. */
const stillFlagged = open.filter((t) => t.urgent || t.important);
if (stillFlagged.length) {
  console.log("");
  console.log("STILL OPEN AND FLAGGED");
  for (const t of stillFlagged) console.log(`  ${name(t.client)}: ${t.text}`);
}
