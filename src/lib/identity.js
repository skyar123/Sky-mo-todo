/* Whose phone is this?

   The lane filter says "Me" and "Mo". On Mo's phone that is backwards, and a
   shared board where the labels lie is worse than no labels. So the device
   remembers who is holding it. It changes only what is displayed: the
   underlying lanes stay "sky" and "mo" for both of them. */

import { readJSON, writeJSON } from "./storage.js";

const KEY = "whoami";
export const PEOPLE = [["sky", "Skylar"], ["mo", "Mo"]];

export const readWho = () => {
  const v = readJSON(KEY);
  return v === "mo" || v === "sky" ? v : null;
};

export const writeWho = (who) => writeJSON(KEY, who);

/** Lane filter labels from this device's point of view. */
export function laneLabels(who) {
  if (who === "mo") return [["all", "All"], ["mo", "Me"], ["sky", "Skylar"]];
  return [["all", "All"], ["sky", "Me"], ["mo", "Mo"]];
}

/** Labels for assigning a task, same idea. */
export function assignLabels(who) {
  if (who === "mo") return [["mo", "Me"], ["sky", "Skylar"], ["both", "Both"]];
  return [["sky", "Me"], ["mo", "Mo"], ["both", "Both"]];
}

/* When this device last caught up on the other person's changes. Device
   scoped, not shared: what Skylar has seen is not what Mo has seen. */
const SEEN = "seen-at";

export const readSeenAt = () => Number(readJSON(SEEN)) || 0;
export const writeSeenAt = (at) => writeJSON(SEEN, at);

/* The weekly sweep writes to the board too, and it is neither of them. A
   banner reading "66 changes from Mo" the Monday after a sweep would be a
   lie, and a banner that lies is worse than no banner. */
export const SWEEP = "sweep";

export const nameOf = (who) =>
  who === "mo" ? "Mo" : who === "sky" ? "Skylar" : who === SWEEP ? "the weekly sweep" : "someone";

/** Who actually made a set of changes, named for the banner. */
export function sourceOf(changes, me) {
  const by = new Set(changes.map((t) => t.by));
  if (!by.size) return "";
  if (by.size === 1) return nameOf([...by][0]);
  const person = me === "sky" ? "mo" : "sky";
  return by.has(SWEEP) && by.has(person)
    ? `${nameOf(person)} and the weekly sweep`
    : "the board";
}

/** Open tasks the other person changed since this device last looked. */
export function changesFromOther(tasks, me, seenAt) {
  if (!me) return [];
  return tasks.filter((t) => t.by && t.by !== me && (t.updatedAt || 0) > seenAt);
}
