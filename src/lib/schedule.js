import { addDays } from "./dates.js";

/* day 0 in the caseload means "no standing slot", not Sunday. Matching it
   against a real weekday would put an unscheduled family on the board every
   Sunday, so scheduled days are explicitly Monday through Saturday. */
export const isScheduled = (f) => typeof f.day === "number" && f.day >= 1 && f.day <= 6;

/* Visit times are written the way they are spoken: "1:00", not "13:00".
   Nothing on this caseload starts before 8am, so a small hour is afternoon. */
export function timeKey(time) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(time || "").trim());
  if (!m) return Number.MAX_SAFE_INTEGER;
  const h = +m[1];
  return (h < 8 ? h + 12 : h) * 60 + +m[2];
}

const byTime = (a, b) => timeKey(a.time) - timeKey(b.time);

export const visitsOn = (families, date) =>
  families.filter((f) => isScheduled(f) && f.day === date.getDay()).sort(byTime);

export const blocksOn = (blocks, date) =>
  blocks.filter((b) => b.day === date.getDay()).sort(byTime);

/** Visits and standing meetings interleaved into one timeline. */
export function agendaFor(families, blocks, date) {
  return [
    ...visitsOn(families, date).map((c) => ({ kind: "visit", time: c.time, c })),
    ...blocksOn(blocks, date).map((b) => ({ kind: "block", time: b.time, label: b.label })),
  ].sort(byTime);
}

/** The next date from `from` onward that actually has visits on it. */
export function nextVisitDay(families, from, maxAhead = 14) {
  for (let i = 0; i <= maxAhead; i++) {
    const d = addDays(from, i);
    if (visitsOn(families, d).length) return d;
  }
  return null;
}

/** The next few visit days, for the reminder day picker. */
export function upcomingVisitDays(families, from, count = 4, maxAhead = 21) {
  const out = [];
  for (let i = 0; i <= maxAhead && out.length < count; i++) {
    const d = addDays(from, i);
    if (visitsOn(families, d).length) out.push(d);
  }
  return out;
}
