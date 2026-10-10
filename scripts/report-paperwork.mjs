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

import { decryptWithKey } from "../src/lib/crypto.js";
import { fromShared } from "../src/lib/shared.js";
import { paperworkSeeds, paperworkDue } from "../src/lib/paperwork.js";
import { startOfDay, daysBetween, parseISO } from "../src/lib/dates.js";
import { parseArgs, siteOf, openCaseload, readBoard } from "./lib/caseload.mjs";

const { opts } = parseArgs(process.argv.slice(2), ["--site", "--caseload", "--days"]);
const DAYS = Number(opts["--days"] || 14);
const passcode = process.env.SKYMO_PASSCODE;
if (!passcode) {
  console.error("SKYMO_PASSCODE is not set.");
  process.exit(2);
}

const { data, key } = await openCaseload(opts, passcode);
const today = startOfDay();
const seeds = [...(data.seedTasks || []), ...paperworkSeeds(data.families, today)];
/* Without the board there is no knowing what has been ticked, and a list of
   every step as owed would be wrong in the loudest possible way. Stop and
   say so instead. */
let doc;
try {
  doc = (await readBoard(`${siteOf(opts)}/api/board`, key, decryptWithKey)).doc || { tasks: {} };
} catch (err) {
  console.log(`PAPERWORK\n\nThe board could not be read (${err.message}), so what has been ticked is unknown. No list this time.`);
  process.exit(1);
}
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
