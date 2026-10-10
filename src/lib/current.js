/* What is current, and what an earlier visit left behind.

   Each week's notes add thirty or forty items and around twenty-five get
   ticked, so a board that only ever grows was the one thing it could do. By
   the end of September a single family carried twenty-six open items, most of
   them "before next visit" for a visit that had already happened and been
   written up again. The newer note is the current plan; the older note's
   leftovers are either done and never ticked, or carried forward into the
   newer note in fresh words.

   So when a newer visit note for a family has been read, the older notes'
   items that nobody has touched step back: out of the counts, off Thursday's
   list, into a folded section on the family. Nothing is deleted, and nothing
   anyone has worked on moves. */

import { parseISO, daysBetween } from "./dates.js";
import { isSupervision } from "../data/library.js";

/* How far apart two notes have to be before the newer one replaces the older.
   Visits are weekly; two notes for the same family a day or two apart are
   nearly always two settings, a school observation and a home visit, each
   with its own errands, and the home visit says nothing about whether the
   school ones are done. Four days still lets a visit moved to early the next
   week replace the one before it. */
const REPLACES_AFTER_DAYS = 4;

/* A note about one family: its title named them. A supervision prep names no
   family in its title, so it never counts as a family's latest visit, or it
   would push that family's real visit items aside. */
const isVisitNote = (t) => !!t.source && !!t.noted && t.fromVisit === true;

/** For each family, the day of its newest visit note (YYYY-MM-DD). */
export function latestVisitByFamily(tasks) {
  const latest = new Map();
  for (const t of tasks) {
    if (!t.client || !isVisitNote(t)) continue;
    if (!latest.has(t.client) || t.noted > latest.get(t.client)) latest.set(t.client, t.noted);
  }
  return latest;
}

/* Visits are weekly and the sweep reads Drive twice a week, so a board whose
   newest note is more than a week and a day old has stopped hearing about
   visits: either there were none, or notes are being saved where the sweep
   cannot see them. Both are worth a line on the day screen. */
export const NOTES_QUIET_DAYS = 8;

/** The newest note the sweep has read, visit or supervision prep (YYYY-MM-DD). */
export function newestNote(tasks) {
  let newest = null;
  for (const t of tasks) if (t?.source && t.noted && (!newest || t.noted > newest)) newest = t.noted;
  return newest;
}

/**
 * True when a task is an earlier visit's leftover.
 *
 * Only the sweep's own items, and only untouched ones: once someone has
 * ticked, edited, moved or handed an item over, it is theirs and stays where
 * they put it. A safety flag or an item starred to cover never fades on its
 * own, and neither does one someone has marked as still needed. An item the
 * sweep wrote before notes were tracked is older than any
 * tracked note, so it steps back once the family has one.
 */
export function isEarlier(t, latest) {
  if (!t || t.done || !t.client) return false;
  if (!String(t.id || "").startsWith("sweep_") || t.by !== "sweep") return false;
  if (t.urgent || t.important || t.kept) return false;
  /* Only a visit note's items give way to a newer visit note. A supervision
     prep's logistics are errands a visit note does not repeat, so a new visit
     says nothing about whether they are done. */
  if (t.source && t.fromVisit !== true) return false;
  const newest = latest.get(t.client);
  if (!newest) return false;
  const noted = parseISO(t.noted || "");
  return !noted || daysBetween(noted, parseISO(newest)) >= REPLACES_AFTER_DAYS;
}

/**
 * A to-do as every list and count means it: not a prompt for supervision,
 * not an earlier visit's untouched leftover, and not a paperwork step, which
 * has its own place at the top of the day and of each family. One rule, so
 * the day's count, a family's count and the past-due pile cannot disagree.
 */
export const isTodo = (t, latest) => !isSupervision(t) && !isEarlier(t, latest) && !t?.paper;
