#!/usr/bin/env node
/* Applies a calendar snapshot to the caseload.

   The app is a static site with no credentials, so it cannot read Google
   Calendar itself. Instead Claude pulls the Child First calendar, writes
   data/calendar-snapshot.json, and this merges it in and reports exactly what
   changed. Run with --dry to see the diff without writing.

   Only the schedule is touched: day, time, place, and the standing meeting
   blocks. Everything clinical stays hand-authored. */

import { readFile, writeFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CASELOAD = path.join(root, "data/caseload.local.json");
const SNAPSHOT = path.join(root, "data/calendar-snapshot.json");
const DRY = process.argv.includes("--dry");
const LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const exists = (p) => access(p).then(() => true, () => false);

if (!(await exists(SNAPSHOT))) {
  console.error("No data/calendar-snapshot.json. Ask Claude to re-sync the calendar first.");
  process.exit(1);
}

const caseload = JSON.parse(await readFile(CASELOAD, "utf8"));
const snap = JSON.parse(await readFile(SNAPSHOT, "utf8"));

/* Calendar titles are written the way a person types them, so a family is
   matched on its own alias list rather than on an exact title. */
function findFamily(match) {
  const m = String(match).toLowerCase();
  return caseload.families.find(
    (f) => f.id === m || f.name.toLowerCase() === m || (f.alias || []).some((a) => a.toLowerCase() === m)
  );
}

const changes = [];
const unmatched = [];
const pending = [];
const TODAY = process.env.SKYMO_TODAY || new Date().toISOString().slice(0, 10);

for (const v of snap.visits || []) {
  const fam = findFamily(v.match);
  if (!fam) {
    unmatched.push(v.match);
    continue;
  }
  /* A slot that has not started yet must not land on this week's board.
     A first visit on Wednesday does not become a standing Tuesday until the
     Tuesday it actually starts. */
  if (v.effectiveFrom && v.effectiveFrom > TODAY) {
    pending.push({ fam, v });
    continue;
  }
  for (const [field, next] of [["day", v.day], ["time", v.time], ["place", v.place]]) {
    if (next === undefined || fam[field] === next) continue;
    changes.push({
      family: fam.name,
      field,
      from: field === "day" ? LONG[fam[field]] || fam[field] : fam[field],
      to: field === "day" ? LONG[next] : next,
      why: v.note || "from the calendar",
    });
    if (!DRY) fam[field] = next;
  }
}

if (snap.blocks) {
  const before = JSON.stringify(caseload.blocks);
  const after = JSON.stringify(snap.blocks);
  if (before !== after) {
    changes.push({ family: "(standing meetings)", field: "blocks", from: before, to: after, why: "from the calendar" });
    if (!DRY) caseload.blocks = snap.blocks;
  }
}

/* Due dates on the calendar are the authority for the ones the app already
   tracks; a mismatch is reported rather than silently overwritten, because a
   wrong due date is worse than a missing one. */
const dueNotes = [];
for (const d of snap.dueDates || []) {
  const fam = findFamily(d.match);
  if (!fam) {
    unmatched.push(d.match);
    continue;
  }
  /* Calendar wording and task wording differ in punctuation more than in
     substance: a hyphen in one and a space in the other, or an extra trailing
     word. Compare on the significant words with punctuation flattened. */
  const norm = (v) => String(v).toLowerCase().replace(/[^a-z0-9]+/g, " ");
  const words = norm(d.what).split(" ").filter((w) => w.length > 2);
  const hit = caseload.seedTasks.find(
    (t) => t.client === fam.id && t.due === d.due && words.some((w) => norm(t.text).includes(w))
  );
  dueNotes.push(
    hit
      ? `  agrees   ${fam.name.padEnd(14)} ${d.due}  ${d.what}`
      : `  NOT SET  ${fam.name.padEnd(14)} ${d.due}  ${d.what}`
  );
}

console.log(`Calendar snapshot from "${snap.source}", pulled ${snap.pulledAt}`);
console.log(`Window ${snap.window?.from} to ${snap.window?.to}\n`);

if (changes.length) {
  console.log(`Schedule changes (${changes.length}):`);
  for (const c of changes) {
    if (c.field === "blocks") {
      console.log(`  ${c.family}: standing meetings updated`);
      continue;
    }
    console.log(`  ${c.family.padEnd(14)} ${c.field.padEnd(6)} ${String(c.from).padEnd(16)} -> ${c.to}`);
    if (c.why && c.why !== "from the calendar") console.log(`  ${"".padEnd(14)} ${c.why}`);
  }
} else {
  console.log("Schedule: already matches the calendar.");
}

if (dueNotes.length) {
  console.log(`\nDue dates on the calendar:`);
  for (const n of dueNotes) console.log(n);
}

if (snap.extras?.length) {
  console.log(`\nOne-off visits on the calendar with no standing slot:`);
  for (const e of snap.extras) {
    const fam = findFamily(e.match);
    console.log(`  ${e.date} ${e.time.padEnd(6)} ${(fam?.name || e.match).padEnd(14)} ${e.label}`);
  }
}

if (pending.length) {
  console.log(`\nSlots that start later, left alone for now:`);
  for (const { fam, v } of pending) {
    console.log(`  ${fam.name.padEnd(14)} ${LONG[v.day]} ${v.time} from ${v.effectiveFrom}`);
    if (v.note) console.log(`  ${"".padEnd(14)} ${v.note}`);
  }
}

if (unmatched.length) {
  console.log(`\nCalendar entries with no family on the caseload: ${[...new Set(unmatched)].join(", ")}`);
}
if (snap.ignored?.length) {
  console.log(`Ignored as personal: ${snap.ignored.join(", ")}`);
}

if (DRY) {
  console.log("\n(dry run, nothing written)");
} else if (changes.length) {
  await writeFile(CASELOAD, JSON.stringify(caseload, null, 2) + "\n", "utf8");
  console.log(`\nWrote data/caseload.local.json. Run: npm run data:encrypt && npm run build`);
} else {
  console.log("\nNothing to write.");
}
