/* Date helpers. Everything in here works on local-midnight Date objects
   so that "days between" is never thrown off by daylight saving time. */

export const LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Local midnight for a given date. */
export function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** YYYY-MM-DD in local time. Never use toISOString here, it shifts to UTC. */
export const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Parse a YYYY-MM-DD string as a local date, not a UTC one. */
export function parseISO(s) {
  if (typeof s !== "string") return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return startOfDay(x);
}

/** Whole days from a to b, DST-safe. */
export function daysBetween(a, b) {
  return Math.round((startOfDay(b) - startOfDay(a)) / 86400000);
}

/**
 * Today, live. Accepts ?date=YYYY-MM-DD to pin the board for a walkthrough
 * or a screenshot without touching the code.
 */
export function resolveToday(search = typeof window === "undefined" ? "" : window.location.search) {
  try {
    const pinned = new URLSearchParams(search).get("date");
    const parsed = parseISO(pinned || "");
    if (parsed) return parsed;
  } catch {
    /* malformed query string, fall through to the real date */
  }
  return startOfDay();
}

export const fmtDay = (d) => d.toLocaleDateString("en-US", { month: "long", day: "numeric" });
export const fmtShort = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** Ordinal date the way you would say it out loud: "Tuesday the 9th". */
export function spokenDate(d) {
  const n = d.getDate();
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen ? "th" : { 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th";
  return `${LONG[d.getDay()]} the ${n}${suffix}`;
}

/**
 * How a due date should read and how loudly it should shout.
 * `today` is passed in so the whole app agrees on what day it is.
 */
export function dueInfo(due, today) {
  const d = parseISO(due);
  if (!d) return null;
  const days = daysBetween(today, d);
  if (days < 0) return { days, label: `${-days}d over`, hot: true };
  if (days === 0) return { days, label: "today", hot: true };
  if (days === 1) return { days, label: "tomorrow", soon: true };
  if (days <= 7) return { days, label: `in ${days}d`, soon: true };
  return { days, label: fmtShort(d) };
}
