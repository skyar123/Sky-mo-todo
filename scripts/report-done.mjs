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

import { decryptWithKey } from "../src/lib/crypto.js";
import { fromShared } from "../src/lib/shared.js";
import { parseArgs, siteOf, openCaseload, readBoard } from "./lib/caseload.mjs";

const { opts } = parseArgs(process.argv.slice(2), ["--site", "--endpoint", "--caseload", "--days"]);
const ENDPOINT = opts["--endpoint"] || `${siteOf(opts)}/api/board`;
const DAYS = Number(opts["--days"] || 7);

const passcode = process.env.SKYMO_PASSCODE;
if (!passcode) {
  console.error("SKYMO_PASSCODE is not set.");
  process.exit(2);
}

/* The same caseload, and so the same key, as every other script. */
const { data, key } = await openCaseload(opts, passcode);
const { doc } = await readBoard(ENDPOINT, key, decryptWithKey);
if (!doc) {
  console.log("The board is empty. Nothing to report.");
  process.exit(0);
}
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
