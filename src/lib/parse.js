import { iso, daysBetween, LONG } from "./dates.js";

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const KIND_TESTS = [
  [/\b(sniff|asq|pkbs|pcl|ces-?d|cesd|ccis|psi|bitsea|pq|battery|assessments?|reassess\w*|scor\w*)\b/, "assess"],
  [/\b(treatment plan|signature|sign|paperwork|form|release|record|chart|consent)\b/, "plan"],
  [/\b(cpp|trauma|circle of security|repair|parentification|attachment)\b/, "cpp"],
];

/**
 * A bare "9/22" has no year on it. Read it as the nearest sensible one:
 * next year if that date is already well behind us, otherwise this year.
 */
export function inferDue(month, day, today) {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const candidate = new Date(today.getFullYear(), month - 1, day);
  if (candidate.getMonth() !== month - 1) return null; // e.g. 2/31
  if (daysBetween(candidate, today) > 180) {
    return iso(new Date(today.getFullYear() + 1, month - 1, day));
  }
  return iso(candidate);
}

/**
 * Which family a line is about. Longest names first, so "s.g." wins over a
 * stray "sg" inside a word.
 *
 * Some names are only safe in a title. A nickname that is also an ordinary
 * word ("blue") identifies a note when it heads one, but in the body it is far
 * more likely to be a blue folder than a family, and one match in the body is
 * enough to file every item on the page under the wrong child. So a family's
 * `titleAlias` names are consulted only when the caller says this line is a
 * title: the first line of a note, or a calendar entry.
 *
 * `fuzzy` forgives one letter in a title. A child's name gets spelled more
 * than one way (one spelling in the caseload, another on the note, a single
 * letter apart), and that one letter was enough for a whole note's items to
 * land with no family. It only applies to names of six letters or more, only when nothing
 * matched exactly, and only when exactly one family is that close: two
 * families a letter apart means the name is genuinely ambiguous, and a wrong
 * guess files a child's items under someone else's.
 */
export function detectFamily(line, families, { titles = false, fuzzy = false } = {}) {
  const low = String(line || "").toLowerCase();
  const candidates = families
    .flatMap((f) => [...(f.alias || []), ...(titles ? f.titleAlias || [] : [])].map((a) => ({ id: f.id, a: a.toLowerCase() })))
    .sort((x, y) => y.a.length - x.a.length);
  for (const { id, a } of candidates) {
    if (new RegExp(`(^|[^a-z0-9])${escape(a)}([^a-z0-9]|$)`, "i").test(low)) return id;
  }
  if (!fuzzy) return null;

  const words = new Set(low.split(/[^a-z]+/).filter((w) => w.length >= 6));
  const close = new Set();
  for (const { id, a } of candidates) {
    if (a.length < 6 || /[^a-z]/.test(a)) continue;
    for (const w of words) if (oneEditApart(w, a)) close.add(id);
  }
  return close.size === 1 ? [...close][0] : null;
}

/** True when two words differ by exactly one letter added, dropped or changed. */
function oneEditApart(a, b) {
  if (a === b) return false;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) === 1;
}

export function detectKind(line) {
  const low = line.toLowerCase();
  for (const [re, kind] of KIND_TESTS) if (re.test(low)) return kind;
  return "care";
}

export function detectDue(line, today) {
  const m = line.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (!m) return null;
  const [, mm, dd, yy] = m;
  if (yy) {
    const year = yy.length === 2 ? 2000 + +yy : +yy;
    const month = +mm;
    const day = +dd;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const d = new Date(year, month - 1, day);
    return d.getMonth() === month - 1 ? iso(d) : null;
  }
  return inferDue(+mm, +dd, today);
}

/** Turns a pasted block of notes into tasks, one per line. */
export function parseNotes(text, { families, today, forcedClient, lane }) {
  const seen = new Set();
  const stamp = Date.now();
  return text
    .split(/\n+/)
    .map((l) => l.replace(/^\s*[-•*▪☐○·\d.)\]]+\s*/, "").trim())
    .filter((l) => l.length > 2)
    .filter((l) => {
      const k = l.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .map((line, i) => ({
      id: `u${stamp}_${i}`,
      client: forcedClient || detectFamily(line, families),
      lane,
      kind: detectKind(line),
      text: line,
      due: detectDue(line, today),
      note: "",
      done: false,
      seed: false,
    }));
}

export const laneLabel = (l) => ({ sky: "Me", mo: "Mo", both: "Both" }[l] || l);
export { LONG };
