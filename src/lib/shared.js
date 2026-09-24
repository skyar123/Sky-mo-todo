/* The shape the board takes when two people share it.

   Netlify Blobs has no concurrency control, and whole-document last-write-wins
   would mean one person's tick silently erasing the other's. So every entry
   carries its own timestamp and merging is per entry, newest wins. Skylar
   ticking one task while Mo ticks another keeps both, which is the case that
   actually happens.

   Deletes leave a tombstone. Without one, a task deleted on one device comes
   straight back from the other's copy on the next sync. */

export const SHARED_VERSION = 1;
/* What one person can change about a seeded task and have the other see.
   "important" is here because a thing marked must-cover on one phone that
   stays unmarked on the other is worse than no flag at all. "handBy" and
   "handNote" carry a handover: who passed the task over and what they wanted
   said with it, which is the part a lane change on its own loses. */
const EDITABLE = ["text", "due", "note", "client", "kind", "agenda", "important", "handBy", "handNote"];

/* An entry this device has never touched carries no timestamp, and must not
   be given one. Stamping it with "now" would make a device that merely
   reloaded look newer than the other person's real change, and quietly
   overwrite it. Untouched means zero, which always loses to a real edit. */
const UNTOUCHED = 0;

/* `by` records which of them last changed an entry, so the other one can be
   shown what moved while they were not looking. It travels with the entry, so
   a merge carries the original author rather than the device that relayed it. */

/* The fields two people can change independently. Each carries its own time,
   so ticking a task and rewording it are separate facts rather than one. */
const FIELDS = ["done", "lane", ...EDITABLE];

/** Only what a person changed about a seeded task; user tasks travel whole. */
function taskEntry(task, original) {
  const at = task.updatedAt || UNTOUCHED;
  const by = task.by;
  const when = task.at || undefined;
  if (!task.seed) return { seed: false, task, updatedAt: at, by, at: when };
  const entry = { seed: true, done: !!task.done, lane: task.lane, updatedAt: at, by, at: when };
  if (original) {
    /* Carried when it differs from the seed, and also when this device has
       stamped it: someone putting a task's wording back to the original is
       making a claim on that field, and an entry that simply omitted it
       would read as never having touched it. */
    for (const k of EDITABLE) {
      if (task[k] !== original[k] || when?.[k] !== undefined) entry[k] = task[k];
    }
  }
  return entry;
}

/**
 * Local board state to the shared document.
 * `stamps` holds when this device last changed each non-task entry.
 */
export function toShared({ tasks, sent, supplies, drops, tombstones = {}, stamps = {} }, originals) {
  const doc = { v: SHARED_VERSION, tasks: {}, sent: {}, supplies: {}, drops: {} };
  const when = (group, k) => stamps?.[group]?.[k] || UNTOUCHED;

  for (const t of tasks) {
    doc.tasks[t.id] = taskEntry(t, originals.get(t.id));
  }
  for (const [id, deletedAt] of Object.entries(tombstones)) {
    doc.tasks[id] = { deleted: true, updatedAt: deletedAt };
  }
  for (const [k, v] of Object.entries(sent || {})) {
    /* The value is who marked it sent, not merely that someone did. Coercing
       it to a boolean here threw that away, and "sent" with no name is how
       both of them end up texting the same family. `true` still arrives from
       older devices and still reads as sent. */
    doc.sent[k] = { v: v || false, updatedAt: when("sent", k) };
  }
  for (const [k, v] of Object.entries(supplies || {})) {
    doc.supplies[k] = { v, updatedAt: when("supplies", k) };
  }
  for (const [k, v] of Object.entries(drops || {})) {
    doc.drops[k] = { v, updatedAt: when("drops", k) };
  }
  return doc;
}

/* Whichever side actually has the entry, and the newer one when both do.
   Written out rather than as one expression because the short form returned
   `a` when neither side had a timestamp, which is `undefined` when only `b`
   holds the entry: the merged map then carried keys pointing at nothing and
   reading it back threw. Serialising hid it, since JSON drops undefined, so
   it only surfaced when a merge result was read in memory. */
const newer = (a, b) => {
  if (!a) return b;
  if (!b) return a;
  return (b.updatedAt || 0) > (a.updatedAt || 0) ? b : a;
};

function mergeMap(a = {}, b = {}) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = newer(a[k], v);
  return out;
}

/* Reading a field off an entry, wherever that entry keeps it: a seeded task
   carries only what was changed, a user task carries the whole thing. */
const holds = (e, k) => (e.seed ? Object.prototype.hasOwnProperty.call(e, k) : !!e.task && k in e.task);
const valueOf = (e, k) => (e.seed ? e[k] : e.task[k]);
const stamped = (e) => (e.at && Object.keys(e.at).length ? e.at : null);

/* No claim at all, which any real one beats. */
const NONE = -1;

/* How strong a claim one side has on one field, as a time.
   Not carrying the field is no claim: a seeded entry holds only what was
   changed, so a side with nothing there is saying it never changed it. This
   is the case that was being got wrong. Holding the value with no time of
   its own is the weakest real claim, which is what a device that stamps
   fields says about one it has never touched. An entry written before
   per-field times carries no stamps, so everything it holds falls back to
   the entry's own time: the old whole-entry behaviour, kept for the days
   after this ships when one phone has the new build and the other does not. */
function claimOf(e, k) {
  if (!holds(e, k)) return NONE;
  const at = stamped(e);
  if (at) return at[k] !== undefined ? at[k] : 0;
  return e.updatedAt || 0;
}

/**
 * Two versions of the same task into one, field by field.
 *
 * Comparing whole entries meant the newer one won outright, so one person
 * ticking a box reverted the other's rewording of the same task with no sign
 * that anything had been lost. Each field now goes to whoever changed that
 * field last, which is the only reading under which both people's work
 * survives.
 */
function mergeTaskEntry(a, b) {
  if (!a) return b;
  if (!b) return a;
  /* A delete is about the whole task, not one field of it. */
  if (a.deleted || b.deleted) return newer(a, b);
  if (!a.seed !== !b.seed) return newer(a, b);

  const win = newer(a, b);
  const lose = win === a ? b : a;
  const out = win.seed ? { ...win } : { ...win, task: { ...win.task } };
  const at = {};

  for (const k of FIELDS) {
    const theirs = claimOf(lose, k);
    const from = theirs > claimOf(win, k) ? lose : win;
    if (from === lose) {
      /* The other side spoke for this field more recently. Take theirs. */
      if (out.seed) out[k] = valueOf(lose, k);
      else out.task[k] = valueOf(lose, k);
    }
    /* Keep the claim as strong as the value it belongs to, so a field that
       won on an entry's own time does not quietly weaken on the next merge. */
    const t = claimOf(from, k);
    if (t > 0) at[k] = t;
  }

  if (Object.keys(at).length) out.at = at;
  else delete out.at;
  return out;
}

function mergeTasks(a = {}, b = {}) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = mergeTaskEntry(a[k], v);
  return out;
}

/** Two shared documents into one. Order does not matter. */
export function mergeShared(a, b) {
  if (!a) return b;
  if (!b) return a;
  return {
    v: SHARED_VERSION,
    tasks: mergeTasks(a.tasks, b.tasks),
    sent: mergeMap(a.sent, b.sent),
    supplies: mergeMap(a.supplies, b.supplies),
    drops: mergeMap(a.drops, b.drops),
  };
}

/** Shared document back to the state the board renders. */
export function fromShared(doc, seedTasks) {
  const entries = doc?.tasks || {};
  const tombstones = {};

  const seeded = seedTasks.map((t) => {
    const e = entries[t.id];
    if (!e || e.deleted) return t;
    const merged = { ...t, done: !!e.done, lane: e.lane || t.lane, updatedAt: e.updatedAt, by: e.by, at: e.at };
    for (const k of EDITABLE) {
      if (Object.prototype.hasOwnProperty.call(e, k)) merged[k] = e[k];
    }
    return merged;
  });

  const user = [];
  for (const [id, e] of Object.entries(entries)) {
    if (!e) continue;
    if (e.deleted) {
      tombstones[id] = e.updatedAt;
      continue;
    }
    if (e.seed === false && e.task) user.push({ ...e.task, id, updatedAt: e.updatedAt, by: e.by, at: e.at });
  }
  user.sort((x, y) => (y.updatedAt || 0) - (x.updatedAt || 0));

  const plain = (m) => Object.fromEntries(Object.entries(m || {}).map(([k, e]) => [k, e.v]));
  const times = (m) => Object.fromEntries(Object.entries(m || {}).map(([k, e]) => [k, e.updatedAt || 0]));

  return {
    tasks: [...user, ...seeded],
    sent: plain(doc?.sent),
    supplies: plain(doc?.supplies),
    drops: plain(doc?.drops),
    tombstones,
    /* Carried back so this device keeps the merged timestamps and does not
       re-announce someone else's change as its own. */
    stamps: { sent: times(doc?.sent), supplies: times(doc?.supplies), drops: times(doc?.drops) },
  };
}
