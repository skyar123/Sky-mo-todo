#!/usr/bin/env node
/* The paperwork owed, read off the board for the Sunday document.

   The weekly note sweep brings in errands; this is the other half of the
   week, the case calendar. Every SNIFF, HOPE, plan review and battery is
   dated from the family's admission, and this lists the ones that are late
   or due in the next fortnight, with whatever has been ticked left out.

   Prints a plain list. The routine puts it in the Sunday document; nothing
   here writes anywhere.

   Run as:  node report-paperwork.mjs [--days 14] [--site URL] [--caseload PATH|URL]
*/

import { readFile } from "node:fs/promises";
import { decryptJSON, decryptWithKey } from "../src/lib/crypto.js";
import { fromShared } from "../src/lib/shared.js";
import { paperworkSeeds, paperworkDue } from "../src/lib/paperwork.js";
import { startOfDay, daysBetween, parseISO } from "../src/lib/dates.js";

const TAKES_VALUE = new Set(["--site", "--caseload", "--days"]);
const opts = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (TAKES_VALUE.has(a)) { opts[a] = process.argv[++i]; continue; }
  if (a.startsWith("--")) opts[a] = true;
}

const SITE = opts["--site"] || "https://sky-mo-caseload.netlify.app";
const DAYS = Number(opts["--days"] || 14);
const passcode = process.env.SKYMO_PASSCODE;
if (!passcode) {
  console.error("SKYMO_PASSCODE is not set.");
  process.exit(2);
}

/* The repository's caseload by default, as the importer reads it: the
   admission dates are there as soon as they are committed, before the site
   has been deployed again. */
const CASELOAD = opts["--caseload"] || (opts["--site"] ? `${SITE}/caseload.enc.json` : null);
const enc = CASELOAD && /^https?:\/\//.test(CASELOAD)
  ? await (await fetch(CASELOAD, { cache: "no-store" })).json()
  : JSON.parse(await readFile(CASELOAD || new URL("../public/caseload.enc.json", import.meta.url), "utf8"));
const { data, key } = await decryptJSON(enc, passcode);

const today = startOfDay();
const seeds = [...(data.seedTasks || []), ...paperworkSeeds(data.families, today)];
const res = await (await fetch(`${SITE}/api/board`, { cache: "no-store" })).json();
const doc = res.blob ? await decryptWithKey(JSON.parse(res.blob), key) : { tasks: {} };
const { tasks } = fromShared(doc, seeds);

const name = (id) => data.families.find((f) => f.id === id)?.name || id;
const due = paperworkDue(tasks, today, DAYS);
const late = due.filter((t) => daysBetween(today, parseISO(t.due)) < 0);
const coming = due.filter((t) => daysBetween(today, parseISO(t.due)) >= 0);
const whose = (t) => (t.lane === "sky" ? "yours" : "with the clinician");
const line = (t) => {
  const d = daysBetween(today, parseISO(t.due));
  const when = d < 0 ? `${-d} days late` : d === 0 ? "due today" : `due ${t.due}`;
  return `  ${name(t.client)}: ${t.text} (${when}, ${whose(t)})`;
};

console.log("PAPERWORK");
console.log("");
if (!due.length) console.log(`Nothing late and nothing due in the next ${DAYS} days.`);
if (late.length) {
  console.log(`LATE (${late.length})`);
  for (const t of late) console.log(line(t));
  console.log("");
}
if (coming.length) {
  console.log(`DUE IN THE NEXT ${DAYS} DAYS (${coming.length})`);
  for (const t of coming) console.log(line(t));
  console.log("");
}

const undated = data.families.filter((f) => !f.admit).map((f) => f.name);
if (undated.length) console.log(`No admission date on file, so not dated: ${undated.join(", ")}.`);
const estimated = data.families.filter((f) => f.admit && f.admitEstimated).map((f) => f.name);
if (estimated.length) console.log(`Admission date estimated, confirm it: ${estimated.join(", ")}.`);
