/* The paperwork clock.

   Every Child First case runs on the same calendar, counted from the day the
   family was admitted: the 60-day packet, a SNIFF each quarter, a treatment
   plan review every 90 days after the 60-day plan, the six-month battery, and
   the termination battery before the twelve-month mark. None of it was on the
   board with a date, so it sat among forty undated errands from visit notes
   and lost to all of them. This works the dates out from the admission date,
   so the paperwork is on the board, dated, before anyone has to remember it.

   The rules are the ones on the case org sheet and the agency's due-date
   calendar: SNIFF quarters fall every 90 days from admission, plan reviews
   every 90 days from the 60-day mark, the six-month battery at six months.

   Each item is a seeded task with an id made from the family and the step,
   so ticking one syncs like any other seeded task, and the same step has the
   same id on both phones and on every day. */

import { parseISO, addDays, iso, daysBetween, fmtShort, startOfDay } from "./dates.js";

/* How long a missed step stays on the board. A recurring one gives way to the
   next occurrence anyway, so two months is enough; a one-off has nothing
   coming after it, so it gets a little longer before it is taken as handled. */
const GRACE_RECURRING = 60;
const GRACE_ONCE = 90;
/* How far ahead to lay out steps: to just past the twelve-month mark, or,
   for a case already past it (extended), six months on from today. Never
   more than two years from admission. */
const HORIZON_MONTHS = 24;

function addMonths(d, n) {
  const x = new Date(d.getFullYear(), d.getMonth() + n, 1);
  /* The same day of the month, or the last day of a shorter month. */
  const last = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate();
  x.setDate(Math.min(d.getDate(), last));
  return startOfDay(x);
}

const SIX_MONTH_MEASURES =
  "ASQ-3; ASQ:SE-2, BITSEA or PKBS-2 by age; YCPC; CCIS; PSI-4-SF; CESD-R; PCL-5; caregiver risk factors.";
const BASELINE_MEASURES =
  "PQ; ASQ-3; ASQ:SE-2, BITSEA or PKBS-2 by age; CCIS; TESI-PRR; YCPC; PSI-4-SF; CESD-R; LSC-R; PCL-5; M-CHAT-R/F under 30 months.";

/**
 * Every step of one family's case, in tracks. A track is a run of steps
 * where a later one replaces an earlier one: a SNIFF nobody did in June is
 * not done in September, the September one is. One-offs are tracks of one.
 */
function tracksFor(admit, today) {
  const at = (n) => addDays(admit, n);
  const sixty = at(60);
  const end = addMonths(admit, 12);
  const cap = addMonths(admit, HORIZON_MONTHS);
  const wanted = end < today ? addDays(today, 180) : addDays(end, 30);
  const horizon = wanted < cap ? wanted : cap;

  const plan = [{ key: "sixty", due: sixty, lane: "both", kind: "plan", text: "60-day CCA and treatment plan, with the PCP page" }];
  for (let n = 1; ; n++) {
    const due = at(60 + 90 * n);
    if (due > horizon) break;
    plan.push({ key: `tpr${n}`, due, lane: "both", kind: "plan", text: `Treatment plan review ${n}, with the PCP page` });
  }

  const sniff = [{ key: "sniff60", due: sixty, lane: "sky", kind: "assess", text: "SNIFF, 60-day" }];
  for (let n = 1; ; n++) {
    const due = at(90 * n);
    if (due > horizon) break;
    sniff.push({ key: `sniff${n}`, due, lane: "sky", kind: "assess", text: `SNIFF, quarter ${n}` });
  }
  /* The 60-day SNIFF and quarter 1 are thirty days apart; kept in date
     order so the later one always wins. */
  sniff.sort((a, b) => a.due - b.due);

  const six = addMonths(admit, 6);
  return {
    once: [
      [{ key: "hope", due: sixty, lane: "sky", kind: "assess", text: "HOPE home observation", note: "Baseline, at a home visit." }],
      [{ key: "baseline", due: sixty, lane: "both", kind: "assess", text: "Baseline assessments", note: BASELINE_MEASURES }],
      [{ key: "six", due: six, starts: addDays(six, -14), lane: "both", kind: "assess", text: "Six-month assessments", note: `${SIX_MONTH_MEASURES} Start two weeks ahead.` }],
    ],
    recurring: [plan, sniff],
    /* The end of the case: the termination battery, then the twelve-month
       mark. Once the mark has passed, the battery before it is moot either
       way (discharged, or extended), so they are one track. */
    end: [[
      { key: "term", due: addDays(end, -30), starts: addDays(end, -80), lane: "both", kind: "assess", text: "Termination assessments", note: `${SIX_MONTH_MEASURES} Also the SNIFF and the YSSF.` },
      { key: "dc", due: end, lane: "both", kind: "plan", text: "Twelve-month mark: discharge summary, or the extension" },
    ]],
  };
}

/** The id a step always has, on every phone and every day. */
export const paperworkId = (familyId, key) => `pw_${familyId}_${key}`;
export const isPaperwork = (t) => !!t?.paper;

/**
 * The steps of one family's case that matter today, as seeded tasks.
 *
 * From each track: the most recent step that has come due, while it is
 * recent enough to still be owed, and everything after it. Steps the
 * caseload records as done start ticked, and so does anything before them
 * in their track.
 */
export function paperworkFor(family, today) {
  const admit = parseISO(family?.admit || "");
  if (!admit) return [];
  const done = new Set(family.paperDone || []);
  const t = tracksFor(admit, today);
  const out = [];

  const take = (track, grace, name) => {
    let lastDone = -1;
    track.forEach((s, i) => { if (done.has(s.key)) lastDone = i; });
    let lastDue = -1;
    track.forEach((s, i) => { if (s.due <= today) lastDue = i; });
    const from = lastDue >= 0 && daysBetween(track[lastDue].due, today) <= grace ? lastDue : lastDue + 1;
    track.forEach((s, i) => {
      if (i < from || i < lastDone) return;
      out.push(toTask(family, s, name, i, done.has(s.key), admit));
    });
  };

  for (const track of t.recurring) take(track, GRACE_RECURRING, track[0].key === "sixty" ? "plan" : "sniff");
  for (const track of t.once) take(track, GRACE_ONCE, track[0].key);
  for (const track of t.end) take(track, GRACE_ONCE, "end");
  return out;
}

function toTask(family, s, track, seq, done, admit) {
  const note = [
    s.note,
    s.starts ? `Opens ${fmtShort(s.starts)}.` : "",
    `Counted from admission, ${fmtShort(admit)}${family.admitEstimated ? " (an estimate: confirm the date)" : ""}.`,
  ].filter(Boolean).join(" ");
  return {
    id: paperworkId(family.id, s.key),
    client: family.id,
    lane: s.lane,
    kind: s.kind,
    text: s.text,
    due: iso(s.due),
    ...(s.starts ? { starts: iso(s.starts) } : {}),
    note,
    done,
    seed: true,
    paper: true,
    track,
    seq,
  };
}

/** Every family's paperwork, for the board's seeded tasks. */
export function paperworkSeeds(families, today) {
  return families.flatMap((f) => paperworkFor(f, today));
}

/**
 * The paperwork to put in front of someone today: not done, and late, due
 * within `days`, or open for starting. A step whose track has a later step
 * ticked is taken as covered by it.
 */
export function paperworkDue(tasks, today, days = 14) {
  const paper = tasks.filter(isPaperwork);
  const doneAfter = new Map();
  for (const t of paper) {
    if (!t.done) continue;
    const k = `${t.client}|${t.track}`;
    doneAfter.set(k, Math.max(doneAfter.get(k) ?? -1, t.seq));
  }
  const limit = addDays(today, days);
  return paper
    .filter((t) => !t.done && !(t.seq < (doneAfter.get(`${t.client}|${t.track}`) ?? -1)))
    .filter((t) => {
      const due = parseISO(t.due);
      const starts = parseISO(t.starts || "");
      return (due && due <= limit) || (starts && starts <= today);
    })
    .sort((a, b) => a.due.localeCompare(b.due));
}

/* A note that asks for one of these steps ("finish the 60-day SNIFF", "flag
   the 90-day plan") comes with no date, and on its own it sank to the bottom
   of the list. The family's clock knows when it is due. HOPE is matched in
   capitals only: the word "hope" turns up in every other note. */
const CLOCK_WORDS = [
  [/\bSNIFF\b/i, "sniff"],
  [/\bHOPE\b/, "hope"],
  [/\btreatment plan\b|\btx plan\b|\bPCP\b|\bCCA\b/i, "plan"],
  [/\b(?:six|6)[- ]month\b/i, "six"],
  [/\bbaseline\b/i, "baseline"],
  [/\btermination\b|\bdischarge\b/i, "end"],
];

/**
 * The due date a note's item takes from the family's clock: the step of its
 * kind that is owed now, or else the next one. Null when the item names no
 * step, or the family has no admission date.
 */
export function clockDueFor(text, family, today, doneIds = new Set()) {
  const hit = CLOCK_WORDS.find(([re]) => re.test(String(text || "")));
  if (!hit) return null;
  /* Ticked counts wherever it was ticked: in the caseload, or on the board
     since. A line about a SNIFF that is done takes the next one's date, and
     everything before the last ticked step is covered by it. */
  const steps = paperworkFor(family, today).filter((s) => s.track === hit[1]);
  const isDone = (s) => s.done || doneIds.has(s.id);
  let last = -1;
  steps.forEach((s, i) => { if (isDone(s)) last = i; });
  return steps.find((s, i) => i > last && !isDone(s))?.due || null;
}

/**
 * Note items dated from the clock where they name a step and have no date
 * of their own. Only the item's title is read: a note that mentions the
 * SNIFF in passing ("asked for across three SNIFF administrations") is not
 * SNIFF work.
 */
export function datedByClock(tasks, families, today, doneIds = new Set()) {
  const byId = new Map(families.map((f) => [f.id, f]));
  return tasks.map((t) => {
    if (t.due || !t.client || !byId.has(t.client)) return t;
    const due = clockDueFor(t.text, byId.get(t.client), today, doneIds);
    return due ? { ...t, due } : t;
  });
}
