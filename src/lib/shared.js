/* The shape the board takes when two people share it.

   Netlify Blobs has no concurrency control, and whole-document last-write-wins
   would mean one person's tick silently erasing the other's. So every entry
   carries its own timestamp and merging is per entry, newest wins. Skylar
   ticking one task while Mo ticks another keeps both, which is the case that
   actually happens.

   Deletes leave a tombstone. Without one, a task deleted on one device comes
   straight back from the other's copy on the next sync. */

export const SHARED_VERSION = 1;
const EDITABLE = ["text", "due", "note", "client", "kind", "agenda"];

/* An entry this device has never touched carries no timestamp, and must not
   be given one. Stamping it with "now" would make a device that merely
   reloaded look newer than the other person's real change, and quietly
   overwrite it. Untouched means zero, which always loses to a real edit. */
const UNTOUCHED = 0;

/* `by` records which of them last changed an entry, so the other one can be
   shown what moved while they were not looking. It travels with the entry, so
   a merge carries the original author rather than the device that relayed it. */

/** Only what a person changed about a seeded task; user tasks travel whole. */
function taskEntry(task, original) {
  const at = task.updatedAt || UNTOUCHED;
  const by = task.by;
  if (!task.seed) return { seed: false, task, updatedAt: at, by };
  const entry = { seed: true, done: !!task.done, lane: task.lane, updatedAt: at, by };
  if (original) {
    for (const k of EDITABLE) if (task[k] !== original[k]) entry[k] = task[k];
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
    doc.sent[k] = { v: !!v, updatedAt: when("sent", k) };
  }
  for (const [k, v] of Object.entries(supplies || {})) {
    doc.supplies[k] = { v, updatedAt: when("supplies", k) };
  }
  for (const [k, v] of Object.entries(drops || {})) {
    doc.drops[k] = { v, updatedAt: when("drops", k) };
  }
  return doc;
}

const newer = (a, b) => ((b?.updatedAt || 0) > (a?.updatedAt || 0) ? b : a);

function mergeMap(a = {}, b = {}) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = newer(a[k], v);
  return out;
}

/** Two shared documents into one. Order does not matter. */
export function mergeShared(a, b) {
  if (!a) return b;
  if (!b) return a;
  return {
    v: SHARED_VERSION,
    tasks: mergeMap(a.tasks, b.tasks),
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
    const merged = { ...t, done: !!e.done, lane: e.lane || t.lane, updatedAt: e.updatedAt, by: e.by };
    for (const k of EDITABLE) {
      if (Object.prototype.hasOwnProperty.call(e, k)) merged[k] = e[k];
    }
    return merged;
  });

  const user = [];
  for (const [id, e] of Object.entries(entries)) {
    if (e.deleted) {
      tombstones[id] = e.updatedAt;
      continue;
    }
    if (e.seed === false && e.task) user.push({ ...e.task, id, updatedAt: e.updatedAt, by: e.by });
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
