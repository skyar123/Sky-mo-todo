#!/usr/bin/env node
/* The note parser, on the shapes that actually arrive.

   Every note in here is invented. The real ones are client material and are
   not going in a file, least of all a tracked one; what is being tested is
   shape, and shape can be written from scratch.

   These cases come from a real weekly sweep: the collator wrote checkboxes
   inline rather than on their own line, and wrote two of the three
   "Bring to the clinical partner" sections as prose with no checkbox at all.
   The second of those used to produce nothing, which meant the items most
   worth carrying to the clinician were the ones silently dropped. */

import { extractFromNote, itemsToTasks } from "../src/lib/extract.js";

const ok = (m) => console.log("  ok   " + m);
const bad = (m) => { console.log("  FAIL " + m); process.exitCode = 1; };
const check = (cond, good, why) => (cond ? ok(good) : bad(why || good));

const families = [
  { id: "f1", name: "Probe", alias: ["Probe"], child: "Kid", day: 2, time: "1:00" },
  { id: "f2", name: "Other", alias: ["Other"], child: "Sib", day: 3, time: "2:00" },
];

const parse = (text) => {
  const { client, items } = extractFromNote(text, { families, today: new Date("2026-09-12T12:00:00") });
  return itemsToTasks(items, { client, lane: null });
};

const NOTE = `Probe: Visit Notes

Before next visit

☐ Bring the feelings cards and check the bubble wand still works.

☐ Follow up with the school about the meeting date.

Bring to the clinical partner

Role split for the start of the work, and how much I lead in caregiver meetings without crowding her.

Whether the story we started belongs inside the trauma narrative or beside it.

Safety flags

The incident last week and the persistence of the pattern warrant clinician-level screening, routed the same day.
`;

const tasks = parse(NOTE);

check(tasks.length === 5, `every item is picked up (${tasks.length} of 5)`);
check(tasks.every((t) => t.client === "f1"), "all of them land on the family in the title");

const before = tasks.filter((t) => t.lane === "sky" && !t.agenda);
check(before.length === 2, "the two checkbox items keep their own lane");

const forClinician = tasks.filter((t) => t.kind === "cpp");
check(forClinician.length === 2, "prose under the clinical-partner heading still becomes items");
check(forClinician.every((t) => t.agenda && t.lane === "both"), "and each one is on the teaming agenda, shared");

const safety = tasks.filter((t) => t.urgent);
check(safety.length === 1, "the safety paragraph becomes one item");
check(safety[0]?.agenda === true, "and it goes to the clinician too");

/* The failure that would be worse than dropping an item: an inline checkbox
   is the other shape the collator emits, and it must parse the same way. */
const inline = parse(`Probe: Visit Notes

Before next visit
☐ Bring the feelings cards and check the bubble wand still works.
`);
check(inline.length === 1, "a checkbox on the same line as its text parses");

const split = parse(`Probe: Visit Notes

Before next visit
☐
Bring the feelings cards and check the bubble wand still works.
`);
check(split.length === 1, "so does a bare checkbox with the text on the next line");
check(split[0]?.text === inline[0]?.text, "and both give the same task");

/* "None this week" is the answer to the heading, not an item under it. As a
   safety task it would be the loudest thing on the board and say nothing. */
const nil = parse(`Probe: Visit Notes

Safety flags

None surfaced in this meeting. Historical concerns are tracked through the assessment.
`);
check(nil.filter((t) => t.urgent).length === 0, "a nil safety answer does not become a red flag");

const turned = parse(`Probe: Visit Notes

Safety flags

None surfaced today, but the caregiver mentioned a new stressor and I want to keep an eye on it.
`);
check(turned.filter((t) => t.urgent).length === 1, "a nil answer that turns is still a flag");

/* Prose outside a Follow-Up heading is the body of the note, not a task list. */
const body = parse(`Probe: Visit Notes

1. The visit

She met me at the door and wanted to show me the new drawing straight away.

2. Clinical lens

The caregiver tracked her closely throughout, which is new and worth noticing.
`);
check(body.length === 0, "narrative outside the follow-up headings stays out of the board");

/* --- who a change came from -------------------------------------------- */

const { sourceOf } = await import("../src/lib/identity.js");

check(
  sourceOf([{ by: "sweep" }, { by: "sweep" }], "sky") === "the weekly sweep",
  "a banner over the sweep's items names the sweep, not the other person"
);
check(sourceOf([{ by: "mo" }], "sky") === "Mo", "and still names the other person when it was them");
check(
  sourceOf([{ by: "mo" }, { by: "sweep" }], "sky") === "Mo and the weekly sweep",
  "and names both when it was both"
);
