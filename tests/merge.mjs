/* Two people editing the same task.

   The board merges per field, not per task, and this is the suite that says
   why. The case that started it: Skylar rewords a task, Mo ticks the same one
   a second later from a copy that never saw the rename. Whole-entry merging
   handed the whole task to whoever wrote last, so the rename vanished with
   nothing on screen to say it had. Both are true at once and both must
   survive.

   No browser here. These are the merge rules themselves, so they run in
   milliseconds and can cover the awkward shapes: an entry from a phone still
   on the old build, a field put back to its original wording, a merge of a
   document with itself. */

import { toShared, mergeShared, fromShared } from "../src/lib/shared.js";

const ok = (m) => console.log("  ok   " + m);
const bad = (m) => { console.log("  FAIL " + m); process.exitCode = 1; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const T = 1_700_000_000_000;
const SEED = [
  { id: "t1", seed: true, text: "original wording", lane: "today", done: false, note: "" },
  { id: "t2", seed: true, text: "second task", lane: "today", done: false, note: "" },
];
const originals = () => new Map(SEED.map((t) => [t.id, { ...t }]));

/** One device's whole board, as it would be written to the shared document. */
const doc = (tasks) => toShared({ tasks, sent: {}, supplies: {}, drops: {} }, originals());

/** A seeded task as one device holds it, with per-field stamps. */
const held = (id, fields, at) => {
  const base = SEED.find((t) => t.id === id);
  const last = Math.max(...Object.values(at));
  return { ...base, ...fields, at, updatedAt: last, by: at.by || "sky" };
};

const read = (merged, id) => fromShared(merged, SEED).tasks.find((t) => t.id === id);

/* Both orders, because the two phones do not agree on who is `a`. */
function bothWays(name, left, right, check) {
  for (const [label, m] of [
    [`${name}`, mergeShared(left, right)],
    [`${name} (other order)`, mergeShared(right, left)],
  ]) {
    const why = check(read(m, "t1"), m);
    why ? bad(`${label}: ${why}`) : ok(label);
  }
}

/* The original loss: a rename and a tick, one second apart. */
bothWays(
  "a rename and a tick on the same task both survive",
  doc([held("t1", { text: "Skylar rewrote this" }, { text: T }), SEED[1]]),
  doc([held("t1", { done: true }, { done: T + 1000 }), SEED[1]]),
  (t) => {
    if (t.done !== true) return `the tick was lost (done ${t.done})`;
    if (t.text !== "Skylar rewrote this") return `the rename was lost (text ${JSON.stringify(t.text)})`;
    return null;
  }
);

/* Same field, both people. The later edit wins; there is no third answer. */
bothWays(
  "the same field edited twice goes to whoever was later",
  doc([held("t1", { note: "call in the morning" }, { note: T })]),
  doc([held("t1", { note: "call after three" }, { note: T + 5000 })]),
  (t) => (t.note === "call after three" ? null : `kept the earlier note (${JSON.stringify(t.note)})`)
);

/* A phone still on the old build writes no stamps at all. Its entry must not
   be able to reach across and undo a field it never carried. */
const legacy = {
  v: 1,
  tasks: { t1: { seed: true, done: true, lane: "today", updatedAt: T + 9000, by: "mo" } },
  sent: {}, supplies: {}, drops: {},
};
bothWays(
  "an entry from the old build keeps its tick without undoing a rename",
  doc([held("t1", { text: "Skylar rewrote this" }, { text: T })]),
  legacy,
  (t) => {
    if (t.done !== true) return "the old build's tick was lost";
    if (t.text !== "Skylar rewrote this") return "the old build's entry undid the rename";
    return null;
  }
);

/* Putting the wording back to the original is itself an edit, and the later
   one. An entry that simply dropped the field would read as never having
   touched it and lose to the older rename. */
bothWays(
  "putting a task's wording back counts as the later edit",
  doc([held("t1", { text: "Skylar rewrote this" }, { text: T })]),
  doc([held("t1", { text: "original wording" }, { text: T + 3000 })]),
  (t) => (t.text === "original wording" ? null : `the revert was undone (${JSON.stringify(t.text)})`)
);

/* A user task travels whole, so both sides hold every field. The per-field
   rule has to apply there too. */
const userTask = (fields, at) => ({
  id: "u1", seed: false, text: "call the school", lane: "today", done: false, client: "",
  ...fields, at, updatedAt: Math.max(...Object.values(at)), by: "sky",
});
{
  const a = doc([userTask({ text: "call the school office" }, { text: T })]);
  const b = doc([userTask({ done: true }, { done: T + 1000 })]);
  const name = "a task one of them added merges per field too";
  for (const [label, merged] of [[name, mergeShared(a, b)], [`${name} (other order)`, mergeShared(b, a)]]) {
    const t = fromShared(merged, SEED).tasks.find((x) => x.id === "u1");
    const why = !t ? "the task is gone" : t.done !== true ? "the tick was lost" :
      t.text !== "call the school office" ? `the rename was lost (${JSON.stringify(t.text)})` : null;
    why ? bad(`${label}: ${why}`) : ok(label);
  }
}

/* A delete is about the whole task, so it does not merge field by field. */
{
  const tomb = { v: 1, tasks: { u1: { deleted: true, updatedAt: T + 2000 } }, sent: {}, supplies: {}, drops: {} };
  const live = doc([userTask({ text: "call the school office" }, { text: T })]);
  const gone = (m) => !fromShared(m, SEED).tasks.some((t) => t.id === "u1");
  gone(mergeShared(live, tomb)) && gone(mergeShared(tomb, live))
    ? ok("a delete still takes the whole task, in either order")
    : bad("a deleted task came back");
}

/* Merging a document with itself must change nothing. The sync only writes
   when the merge differs from what is on the server, so a merge that keeps
   rewriting its own output would put both phones back to writing every
   forty-five seconds for the rest of the day. */
{
  const one = mergeShared(
    doc([held("t1", { text: "Skylar rewrote this" }, { text: T })]),
    doc([held("t1", { done: true }, { done: T + 1000 })])
  );
  same(one, mergeShared(one, one))
    ? ok("merging a settled document with itself changes nothing")
    : bad("merging a document with itself keeps changing it, so both phones would never stop writing");

  /* The old-build entry above is upgraded on first merge, which is one write.
     It has to settle immediately after that, not drift. */
  const up = mergeShared(legacy, legacy);
  same(up, mergeShared(up, up))
    ? ok("an old-build document settles after one upgrade write")
    : bad("an old-build document never settles");
}

/* What one person sees must not depend on which copy their phone merged
   first, or the two boards disagree until someone reloads. */
{
  const a = doc([held("t1", { text: "Skylar rewrote this" }, { text: T })]);
  const b = doc([held("t1", { done: true }, { done: T + 1000 })]);
  const c = doc([held("t1", { note: "school called back" }, { note: T + 2000 })]);
  same(mergeShared(mergeShared(a, b), c), mergeShared(a, mergeShared(b, c)))
    ? ok("three edits land the same way whatever order they arrive in")
    : bad("the merge depends on arrival order, so the two phones can disagree");
}
