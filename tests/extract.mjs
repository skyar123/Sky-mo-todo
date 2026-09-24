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

/* --- names that are only safe in a title --------------------------------- */

/* A family's filler nickname can be an ordinary word. In the title of a note
   it names the family; in the body it is almost always just the word, and a
   single body match is enough to file every item on the page under the wrong
   child. So those names are consulted for titles and calendar entries only.
   The families and the nickname here are invented. */
{
  const { detectFamily } = await import("../src/lib/parse.js");
  const named = [
    { id: "f1", name: "Probe", alias: ["Probe"], titleAlias: ["teal"], child: "Kid", day: 2, time: "1:00" },
    { id: "f2", name: "Other", alias: ["Other"], child: "Sib", day: 3, time: "2:00" },
  ];
  const whose = (text) => extractFromNote(text, { families: named, today: new Date("2026-09-12T12:00:00") }).client;

  check(detectFamily("Teal: Visit Notes", named, { titles: true }) === "f1", "a title-only nickname names the family in a title");
  check(detectFamily("bring the teal folder", named) === null, "but the same word in ordinary text names nobody");
  check(
    whose("Teal: Visit Notes\n\nBefore next visit\n☐\ncall about the appointment\n") === "f1",
    "a note headed with the nickname is filed under that family"
  );
  check(
    whose("Other: Visit Notes\n\nBefore next visit\n☐\nbring the teal folder next time\n") === "f2",
    "a note for another family that happens to use the word stays with that family"
  );
  /* The title line is asked first and alone. A longer name mentioned in the
     first item used to outrank the one in the title. */
  const longer = [
    { id: "a", name: "Ab", alias: ["ab"], day: 1, time: "1:00" },
    { id: "b", name: "Longername", alias: ["longername"], day: 2, time: "2:00" },
  ];
  check(
    extractFromNote("Ab: Visit Notes\n\nBefore next visit\n☐\nask longername's mum about the forms\n", {
      families: longer,
      today: new Date("2026-09-12T12:00:00"),
    }).client === "a",
    "the family in the title wins over a longer name mentioned in the first item"
  );
}

/* --- notes exactly as Google Drive hands them over ----------------------- */

/* The sweep now copies each note's text and lets this parser decide what is
   an item. Drive's export is not what was typed: numbered headings are
   escaped ("5\. Follow-Up"), follow-up lists are markdown tables, role
   brackets are escaped, and the emoji in front of them arrive as mojibake
   ("ð", "ð¥"). These notes are invented, in that exact shape. */
{
  const { extractFromSource, normaliseNoteText } = await import("../src/lib/extract.js");
  const fams = [
    { id: "f1", name: "Probe", alias: ["probe"], titleAlias: ["teal"], day: 2, time: "1:00" },
    { id: "f2", name: "Other", alias: ["other", "rosalind"], day: 3, time: "2:00" },
  ];
  const today = new Date("2026-09-23T12:00:00");

  const VISIT = [
    "Probe: Visit Notes, week of 2026-09-14",
    "",
    "|  |  |",
    "| :-: | :-: |",
    "| At a Glance |  |",
    "| Who was there, feel of the room | Mo and the family. Warm, then rushed. |",
    "",
    "1\\. The Visit",
    "",
    "A long narrative paragraph about the visit that sits outside the follow-up part of the note and must stay out of the board.",
    "",
    "5\\. Follow-Up",
    "",
    "|  |  |",
    "| :-: | :-: |",
    "| ☐ | Confirm the reassessment timing for the speech question. |",
    "| ☐ | Tell Mo about the ending and propose the slower goodbye before next visit. |",
    "",
    "Safety flags: none disclosed in this memo.",
    "",
    "6\\. Open Threads and Supervision",
    "",
    "ð \\[individual\\] I keep wondering what my preference for play is protecting, and what it costs.",
    "",
    "ð¥ \\[team\\] Our schedule pressure ended the visit early. How do we build in landing time?",
    "",
    "ð \\[group\\] When a child rehearses goodbyes in play, how do we tell repair from repetition?",
  ].join("\n");

  check(/^5\. Follow-Up$/m.test(normaliseNoteText(VISIT)), "Drive's escaped headings are read as headings");
  check(/^☐ Confirm the reassessment/m.test(normaliseNoteText(VISIT)), "a follow-up table row becomes a checkbox line");

  const v = extractFromSource({ title: "Probe Visit Notes 2026-09-23.docx", text: VISIT, families: fams, today });
  /* Role-marked lines carry their forum; [team] ones are teaming items. */
  const todo = v.items.filter((i) => !i.forum);
  const sup = v.items.filter((i) => i.forum);
  check(v.client === "f1", "the family comes from the file's title");
  check(todo.length === 2, `both follow-up items come out of the table (${todo.length})`, `expected 2 follow-up items, got ${todo.length}`);
  check(!v.items.some((i) => /narrative|who was there/i.test(i.text)), "narrative and the at-a-glance table stay out of the board");
  check(!v.items.some((i) => i.urgent), "\"Safety flags: none disclosed\" on one line raises no flag");
  check(sup.length === 3, `all three supervision lines are read despite the scrambled emoji (${sup.length})`, `expected 3 supervision lines, got ${sup.length}`);
  const forum = (f) => sup.find((i) => i.forum === f);
  check(forum("team")?.agenda === true && forum("team").kind !== "supervision", "[team] is an ordinary teaming item: on Thursday's list, counted and printed");
  check(forum("individual")?.kind === "supervision" && !forum("individual").agenda, "[individual] is for my supervision, not the teaming list");
  check(forum("group")?.kind === "supervision" && !forum("group").agenda, "[group] is for group supervision, not Thursday's list");
  check(sup.every((i) => i.client === "f1"), "and all of them stay with the note's family");

  /* The same note read twice gives the same items. This is the property the
     weekly sweep's once-only import is built on. */
  const again = extractFromSource({ title: "Probe Visit Notes 2026-09-23.docx", text: VISIT, families: fams, today });
  check(JSON.stringify(again.items) === JSON.stringify(v.items), "the same note always gives the same items");

  const PREP = [
    "Reflective Supervision Prep: Week of 2026-09-14",
    "",
    "7\\. Questions I am picking",
    "",
    "Responding: where did that moment sit in my body when I heard it retold? (Probe)",
    "",
    "10\\. Safety and follow-through",
    "",
    "|  |",
    "| :-: |",
    "| Safety items (confirm, do not re-carry)Probe mom: screener endorsed passive thoughts, no intent. Confirm Mo's follow-through is complete.Lead exposure: labs pending for the little one; check in Thursday. |",
    "",
    "11\\. Logistics (capped at 20%)",
    "",
    "|  |  |",
    "| :-: | :-: |",
    "| ☐ | Probe mom: therapist-list follow-up, offer to call together. |",
    "| ☐ | Other's family: look into the pre-K options and the bus. |",
    "| ☐ | Teal: confirm the office booking for next week. |",
    "| ☐ | Rosalynd's mom: send the same resource list. |",
    "",
    "12\\. Closing integration (say it out loud)",
    "",
    "|  |",
    "| :-: |",
    "| IntegrationNew understanding: something reflective here that is not a task at all. |",
  ].join("\n");

  const p = extractFromSource({ title: "Supervision Prep Week of 2026-09-14.docx", text: PREP, families: fams, today });
  const logistics = p.items.filter((i) => i.section === "Logistics");
  const safety = p.items.filter((i) => i.urgent);
  check(p.client === null, "a supervision prep names no family in its title, so it is not filed under one");
  check(logistics.length === 4, `each Logistics line is an item (${logistics.length})`, `expected 4 logistics items, got ${logistics.length}`);
  check(logistics.find((i) => /therapist-list/.test(i.text))?.client === "f1", "\"Probe mom: ...\" is filed under Probe");
  check(logistics.find((i) => /pre-K/.test(i.text))?.client === "f2", "\"Other's family: ...\" is filed under Other");
  check(logistics.find((i) => /office booking/.test(i.text))?.client === "f1", "a title-only nickname counts when it labels a line");
  check(logistics.find((i) => /resource list/.test(i.text))?.client === "f2", "a label spelled one letter off the caseload still finds its family");
  check(safety.length === 2, `the run-on safety box splits into its two items (${safety.length})`, `expected 2 safety items, got ${safety.length}`);
  check(safety.find((i) => /screener/.test(i.text))?.client === "f1", "and the one about Probe is filed under Probe");
  check(!p.items.some((i) => /safety items \(confirm/i.test(i.text)), "the box's own heading is not an item");
  check(!p.items.some((i) => /integration|where did that moment sit/i.test(i.text)), "reflection and closing integration stay in the document");

  /* A paragraph that says it is not a flag is not a flag. */
  const WATCH = [
    "Probe: Visit Notes",
    "",
    "Safety flags",
    "None in the memo. Watch item, not a flag: the move home is a big household change.",
  ].join("\n");
  const w = extractFromSource({ title: "Probe Visit Notes.docx", text: WATCH, families: fams, today }).items;
  check(w.length === 1 && !w[0].urgent, "\"watch item, not a flag\" stays on the board but is not marked as a safety flag");
}

/* --- latest visit first -------------------------------------------------- */

/* Once a newer visit note for a family is in, the older notes' untouched
   items step back out of the counts and Thursday's list. Only untouched
   sweep items, and never a safety flag, a starred item or one marked as
   still needed. A supervision prep never counts as a family's latest visit. */
{
  const { latestVisitByFamily, isEarlier } = await import("../src/lib/current.js");
  const sw = (id, over) => ({ id: `sweep_${id}`, client: "f1", by: "sweep", done: false, source: "d", fromVisit: true, ...over });
  const tasks = [
    sw("old", { noted: "2026-09-14" }),
    sw("new", { noted: "2026-09-23" }),
    sw("prep", { noted: "2026-09-25", fromVisit: false }),
    sw("oldprep", { noted: "2026-09-19", fromVisit: false }),
    sw("legacy", { noted: undefined, source: undefined, fromVisit: undefined }),
    sw("ticked", { noted: "2026-09-14", by: "sky" }),
    sw("flag", { noted: "2026-09-14", urgent: true }),
    sw("star", { noted: "2026-09-14", important: true }),
    sw("kept", { noted: "2026-09-14", kept: true }),
    { id: "u123", client: "f1", by: "sky", done: false, noted: "2026-09-01" },
    sw("elsewhere", { client: "f2", noted: "2026-09-01" }),
  ];
  const latest = latestVisitByFamily(tasks);
  const earlier = (id) => isEarlier(tasks.find((t) => t.id === id || t.id === `sweep_${id}`), latest);

  check(latest.get("f1") === "2026-09-23", "a family's latest visit is its newest visit note");
  check(!latest.has("f2") || latest.get("f2") === "2026-09-01", "and each family is judged on its own notes");
  check(latest.get("f1") !== "2026-09-25", "a supervision prep never counts as a family's latest visit");
  check(earlier("old") === true, "an older note's untouched item steps back");
  check(earlier("new") === false, "the latest note's items stay current");
  check(earlier("prep") === false, "a newer supervision prep's items stay current");
  check(earlier("oldprep") === false, "a supervision prep's errands are not replaced by a newer visit note");
  check(earlier("legacy") === true, "an item from before notes were tracked steps back once the family has a tracked note");
  check(earlier("ticked") === false, "anything someone has touched stays where they put it");
  check(earlier("flag") === false, "a safety flag never fades on its own");
  check(earlier("star") === false, "nor does an item starred to cover");
  check(earlier("kept") === false, "nor one marked as still needed");
  check(earlier("u123") === false, "an item added by hand is never the sweep's to move");
  check(earlier("elsewhere") === false, "a family with no newer note keeps everything current");
}

/* --- headings that are not headings -------------------------------------

   From review. A heading has to be the whole line. When section names matched
   anywhere in a short line, "Parent-child interaction:" (which contains
   "action") turned the visit narrative below it into to-dos, and "Safety
   discussed with mom." turned the reassurance after it into a red safety
   flag on Thursday's list. */
{
  const fams = [{ id: "f1", name: "Probe", alias: ["probe"], day: 2 }];
  const run = (lines) => extractFromNote(lines.join("\n"), { families: fams, today: new Date("2026-09-23T12:00:00"), client: "f1" }).items;
  check(
    run(["1. The visit", "Parent-child interaction: warm, mom followed his lead the whole time.", "He stacked the blocks and knocked them down, laughing each time."]).length === 0,
    "a narrative label containing \"action\" does not start a to-do list"
  );
  check(
    run(["Safety discussed with mom.", "Mom said the outlets are covered and the cabinets are latched now."]).length === 0,
    "a sentence starting with \"Safety\" does not raise a safety flag"
  );
  check(
    run(["Clinician observed: mom was more attuned this week than last.", "More narrative that should stay out of the board entirely."]).length === 0,
    "\"Clinician observed:\" does not put narrative on the teaming list"
  );
  const real = run(["5. Follow-Up", "☐ Call the school about the meeting date.", "Safety flags: mom disclosed a new worry about the neighbour."]);
  check(real.length === 2 && real[1].urgent, "real headings, with or without an answer after the colon, still work");
}
