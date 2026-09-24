/* Pulling todos out of a visit note.

   These notes already carry their structure: a Follow-Up section whose
   headings say whose job each item is, checkbox lines for the items
   themselves, and a supervision section marked by role. So this reads the
   structure rather than guessing from prose, which is both more accurate and
   easier to trust when it gets something wrong.

   The full sentence goes in the note; the task line is shortened, because a
   todo you cannot read at a glance on a phone is not a todo. */

import { detectFamily, detectKind, detectDue } from "./parse.js";

const CHECKBOX = /^\s*(?:[\u2610\u25A2\u25A1\u25FB\u2611\u2713]\uFE0F?|\[\s*\]|\[x\]|-\s*\[\s*\])\s*/i;
const SUPERVISION = /^\s*(?:🙋|👥|🌐)\s*\[?(individual|team|group)\]?\s*/iu;
const BULLET = /^\s*[-•*▪·]\s+/;

/* Headings inside a Follow-Up section. Order matters: the more specific
   phrases are tested first so "bring to the clinical partner" does not fall
   through to the generic case. */
const SECTIONS = [
  { test: /safety\s*flag/i,                      lane: "both", kind: "admin", label: "Safety", urgent: true, agenda: true },
  { test: /clinical partner|clinician|supervis/i, lane: "both", kind: "cpp",   label: "With the clinician", agenda: true },
  { test: /before (the )?next visit|follow[- ]?up|to do|action/i, lane: "sky", kind: null, label: "Before next visit" },
];

const STOP_SECTION = /^\s*\d+\.\s|^\s*(the visit|clinical lens|at a glance|abecedarian)/i;

/* "None surfaced in this meeting" is the answer to the heading, not an item
   under it, and as a Safety task it would be the loudest thing on the board
   while saying nothing. Only skipped when the sentence stays negative: a
   paragraph that turns ("none today, but she mentioned") is the case the
   heading exists for. */
const NEGATIVE = /^\s*(none|nothing|no\b|n\/a|not applicable)/i;
const TURNS = /\b(but|however|though|although|except|watch|keep an eye|monitor)\b/i;
const isNilAnswer = (s) => NEGATIVE.test(s) && !TURNS.test(s);

/* Trim a long sentence down to the part that says what to do. The rest is
   kept, just not in the title. */
export function simplify(line, { keepLong = false } = {}) {
  let s = line.replace(/\s+/g, " ").trim();

  /* Stop at the end of the first sentence or question. What follows is
     usually reasoning, and reasoning belongs in the note. */
  const sentence = s.search(/[.?](\s+[A-Z"']|$)/);
  if (sentence > 24) s = s.slice(0, sentence);

  if (!keepLong) {
    const cuts = [
      / so that /i, / so the /i, / so I /i, / because /i, / which /i,
      /, and how /i, /, and what /i, / while the /i, / before offering /i, / \(/,
    ];
    for (const c of cuts) {
      const m = s.match(c);
      if (m && m.index > 24) s = s.slice(0, m.index);
    }
  }

  const limit = keepLong ? 110 : 78;
  if (s.length > limit) {
    /* Prefer a clause boundary over a word boundary: "...violence at age" is
       a worse place to stop than "...(potential self-injury)". */
    const comma = s.lastIndexOf(", ", limit);
    const space = s.lastIndexOf(" ", limit);
    const cut = comma > 40 ? comma : space > 40 ? space : limit;
    s = s.slice(0, cut);
  }

  /* Never end on a word that leaves the reader hanging. */
  s = s.replace(/[\s,;:.?]+$/, "");
  for (let i = 0; i < 4; i++) {
    const trimmed = s.replace(
      /[\s,]+(with|and|or|for|to|on|in|at|of|the|a|an|from|by|as|into|about|that|than|when|where|who|how)$/i,
      ""
    );
    if (trimmed === s) break;
    s = trimmed;
  }
  s = s.replace(/[\s,;:.]+$/, "");

  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* Which Follow-Up heading, if any, this line opens. */
function sectionFor(line) {
  const clean = line.replace(/^\s*\d+\.\s*/, "").trim();
  if (!clean || clean.length > 48) return null;
  if (CHECKBOX.test(line)) return null;
  return SECTIONS.find((s) => s.test.test(clean)) || null;
}

/**
 * Reads a whole visit note and returns tasks, plus what it understood, so the
 * result can be shown before anything is added.
 */
/* The weekly sweep writes one document holding every family's note, blocks
   separated by a rule and each headed "<Pseudonym>: Visit Notes". Read as a
   single note that whole document collapses onto whichever family the first
   line happened to name, which is worse than useless: eight families' items
   filed under one. So split first, and read each block on its own. */
const RULE = /^\s*\\?-{3,}\s*$/;
const BLOCK_HEAD = /^\s*(.+?):\s*visit notes\b/i;

export function splitBlocks(text) {
  const lines = String(text || "").split(/\r?\n/);
  const blocks = [];
  let current = null;

  for (const line of lines) {
    if (RULE.test(line)) { current = null; continue; }
    if (BLOCK_HEAD.test(line)) {
      current = [line];
      blocks.push(current);
      continue;
    }
    if (current) current.push(line);
  }

  /* No headed blocks at all: an ordinary single note, pasted whole. */
  if (!blocks.length) return [String(text || "")];
  return blocks.map((b) => b.join("\n"));
}

/**
 * Every follow-up item in a pasted document, each stamped with its own family.
 *
 * One block or twenty; the caller does not need to know which it was given.
 */
export function extractFromDoc(text, { families, today }) {
  const blocks = splitBlocks(text);
  const items = [];
  const clients = new Set();

  for (const b of blocks) {
    const one = extractFromNote(b, { families, today });
    for (const i of one.items) items.push({ ...i, client: one.client });
    clients.add(one.client || null);
  }

  return {
    items,
    /* A single-family paste still answers "which family is this", which is
       what the review screen says back before anything is added. */
    client: clients.size === 1 ? [...clients][0] : null,
    families: clients.size,
  };
}

export function extractFromNote(text, { families, today }) {
  const lines = String(text || "").split(/\r?\n/);

  /* The family is usually the first thing on the page (the pseudonym, then
     "Visit Notes"), so the title line is asked first and alone. It used to be
     folded into the first six lines, which meant a longer name mentioned in
     the first item could outrank the one in the title; and the title is the
     only place a nickname that doubles as an ordinary word can be trusted.
     Then the opening lines, then the whole note. */
  const title = lines.find((l) => l.trim()) || "";
  const head = lines.slice(0, 6).join(" ");
  const client =
    detectFamily(title, families, { titles: true }) ||
    detectFamily(head, families) ||
    detectFamily(text, families);

  const items = [];
  let section = null;
  let pending = null; // a checkbox on its own line, with the text below it

  const push = (raw, sec) => {
    const body = raw.replace(CHECKBOX, "").replace(BULLET, "").trim();
    if (body.length < 8) return;
    if (isNilAnswer(body)) return;
    const text2 = simplify(body, { keepLong: !!sec?.urgent });
    items.push({
      text: text2,
      note: body === text2 ? "" : body,
      lane: sec?.lane || "sky",
      kind: sec?.kind || detectKind(body),
      due: detectDue(body, today),
      section: sec?.label || "From the note",
      urgent: !!sec?.urgent,
      /* "Bring to the clinical partner" is literally the teaming agenda. */
      agenda: !!sec?.agenda,
    });
  };

  for (const raw of lines) {
    const line = raw.replace(/[\u00A0\u2007\u202F]/g, " ");
    if (!line.trim()) continue;

    /* Supervision lines carry their own role marker and are always shared. */
    const sup = line.match(SUPERVISION);
    if (sup) {
      const role = sup[1].toLowerCase();
      const body = line.replace(SUPERVISION, "").trim();
      if (body.length >= 8) {
        items.push({
          text: simplify(body),
          note: body,
          lane: role === "individual" ? "sky" : "both",
          kind: "admin",
          due: null,
          section: role === "individual" ? "Supervision, mine" : "Supervision, shared",
          urgent: false,
          agenda: role !== "individual",
        });
      }
      pending = null;
      continue;
    }

    const nextSection = sectionFor(line);
    if (nextSection) {
      section = nextSection;
      pending = null;
      continue;
    }
    if (STOP_SECTION.test(line) && !CHECKBOX.test(line)) {
      /* A numbered part heading ends the current list unless it is itself a
         Follow-Up heading, which sectionFor already caught. */
      if (!/follow[- ]?up/i.test(line)) section = null;
      pending = null;
      continue;
    }

    if (CHECKBOX.test(line)) {
      const rest = line.replace(CHECKBOX, "").trim();
      if (rest) push(line, section);
      else pending = section; // bare checkbox; the text is on the next line
      continue;
    }

    if (pending !== null) {
      push(line, pending);
      pending = null;
      continue;
    }

    /* Inside a Follow-Up heading, a paragraph with no checkbox is still an
       item. Safety flags are usually written that way, and so, it turns out,
       is "Bring to the clinical partner" whenever the thought is a sentence
       rather than a task. Requiring the checkbox silently dropped exactly the
       items that were most worth carrying to the clinician. A heading is a
       strong enough signal on its own; the length bar keeps stray fragments
       out. */
    if (section && line.trim().length > 24) {
      push(line, section);
    }
  }

  /* The same item written twice in one note is a formatting artefact. */
  const seen = new Set();
  const unique = items.filter((i) => {
    const k = i.text.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return { client, items: unique };
}

/** Turns extracted items into board tasks. */
export function itemsToTasks(items, { client, lane }) {
  const stamp = Date.now();
  return items.map((i, n) => ({
    id: `n${stamp}_${n}`,
    /* An item that already knows its family keeps it: a multi-family paste
       must not be flattened onto one client by the caller's default. */
    client: i.client !== undefined ? i.client : client || null,
    lane: lane || i.lane,
    kind: i.kind || "care",
    text: i.text,
    due: i.due,
    note: i.note,
    agenda: !!i.agenda,
    /* A safety flag is the one item that must not read like the rest. It is
       marked red while the extraction is being reviewed, and it kept nothing
       once it reached the board, which is the wrong way round. */
    urgent: !!i.urgent,
    done: false,
    seed: false,
  }));
}
