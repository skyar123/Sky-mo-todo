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
