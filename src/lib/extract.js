/* Pulling todos out of a visit note.

   These notes already carry their structure: a Follow-Up section whose
   headings say whose job each item is, checkbox lines for the items
   themselves, and a supervision section marked by role. So this reads the
   structure rather than guessing from prose, which is both more accurate and
   easier to trust when it gets something wrong.

   The full sentence goes in the note; the task line is shortened, because a
   todo you cannot read at a glance on a phone is not a todo. */

import { detectFamily, detectKind, detectDue } from "./parse.js";

const BOX = "[\\u2610\\u25A2\\u25A1\\u25FB\\u2611\\u2713]\\uFE0F?";
const CHECKBOX = new RegExp(`^\\s*(?:${BOX}|\\[\\s*\\]|\\[x\\]|-\\s*\\[\\s*\\])\\s*`, "i");
const CHECKBOX_ONLY = new RegExp(`^(?:${BOX}|\\[\\s*\\]|\\[x\\])$`, "i");

/* A supervision line is marked by its role, and the role in brackets is the
   part to trust. The emoji in front of it is decoration, and it does not
   survive the trip out of Google Drive: 🙋 arrives as "ð" and 👥 as "ð¥".
   So the bracketed role is matched on its own, after at most a few
   characters of whatever the emoji turned into. */
const SUPERVISION = /^\s*(?:(?:🙋|👥|🌐)\s*\[?(individual|team|group)\]?|[^A-Za-z0-9[]{0,8}\[(individual|team|group)\])\s*/iu;
const BULLET = /^\s*[-•*▪·]\s+/;

/* Headings inside a follow-up part of a note. Order matters: the more
   specific phrases are tested first, so "bring to the clinical partner" does
   not fall through to the generic case.

   Each one has to be the whole heading, allowing only a parenthetical and a
   colon after it. They used to match anywhere in a short line, and once a
   "Label: answer" line could open a section that was badly wrong: "Parent-
   child interaction:" contains "action" and turned the visit narrative below
   it into to-dos, and "Safety discussed with mom." turned the reassurance
   after it into a red safety flag on Thursday's list.

   "Safety and follow-through" is how a supervision prep names its safety
   part. "Supervision" alone opens nothing: a heading like "Open Threads and
   Supervision" introduces role-marked lines, which are read on their own. */
const TAIL = String.raw`\s*(?:\([^)]*\))?\s*:?\s*$`;
const heading = (words) => new RegExp(`^(?:${words})${TAIL}`, "i");
const SECTIONS = [
  { test: heading(String.raw`safety(?:\s+(?:flags?|items?|concerns?|check|(?:and|&)\s+follow[- ]?through))?`),
    lane: "both", kind: "admin", label: "Safety", urgent: true, agenda: true },
  { test: heading(String.raw`bring to (?:the )?(?:clinical partner|clinician|supervision)|for the clinician|with the clinician|clinical partner`),
    lane: "both", kind: "cpp", label: "With the clinician", agenda: true },
  { test: heading(String.raw`logistics`),
    lane: "sky", kind: "care", label: "Logistics" },
  { test: heading(String.raw`before (?:the )?next visit|follow[- ]?ups?|to[- ]?dos?|action items?|next steps?`),
    lane: "sky", kind: null, label: "Before next visit" },
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

/* A paragraph under the safety heading that says, in its own words, that it
   is not a flag. "None in the memo. Watch item, not a flag: ..." turns, so it
   is kept, but it was being marked red as a safety flag, which is the one
   thing it said it was not. It stays on the board as an ordinary item. */
const NOT_A_FLAG = /\bnot (?:a |yet a )?(?:safety )?flag\b|\bno (?:safety )?flag\b|\bnothing to flag\b/i;

/**
 * The family an item names for itself, when it opens with a label.
 *
 * A supervision prep covers several families in one document, one line each:
 * "Maple mom: therapist-list follow-up", "Juniper: confirm office booking". The
 * document's title names no family, so each line has to say whose it is, and
 * the label before the colon is where it says so. A label is a title in
 * miniature, so names only trusted in titles count here too. Returns
 * undefined when there is no label or it names nobody, so the caller keeps
 * the note's own family.
 */
function familyFromLabel(line, families) {
  const m = String(line).match(/^\s*([^:]{2,40}):\s/);
  if (!m) return undefined;
  const label = m[1]
    .replace(/[’']s\b/gi, "")
    .replace(/\b(family|mom|mum|mother|dad|father|caregivers?|parents?|grandma|grandmother|home)\b/gi, "")
    .trim();
  if (!label) return undefined;
  return detectFamily(label, families, { titles: true, fuzzy: true }) || undefined;
}

/* A run-on table cell. Drive exports a boxed paragraph as one cell with its
   line breaks removed, so "Safety items (confirm)Mom: screener..." arrives as
   one string. A full stop or closing bracket followed directly by a capital,
   with no space, is where a line break used to be. */
const splitRunOn = (cell) => cell.split(/(?<=[.)])(?=[A-Z])/).map((s) => s.trim()).filter(Boolean);

/**
 * A note as Google Drive hands it over, back into the lines it was written as.
 *
 * Drive's text export of a .docx escapes the full stop in "5. Follow-Up" and
 * the brackets in "[team]", lays out anything that was a table as markdown
 * pipes, and turns emoji into mojibake. The note underneath is fine; this
 * undoes the transport so the parser sees what was written. Text that did not
 * come from Drive passes through unchanged.
 */
export function normaliseNoteText(text) {
  const unescape = (s) => s.replace(/\\([.[\]#*_()\-!+>|])/g, "$1");
  const out = [];
  for (const raw of String(text || "").split(/\r?\n/)) {
    const row = raw.match(/^\s*\|(.*)\|\s*$/);
    if (!row) {
      out.push(unescape(raw));
      continue;
    }
    const cells = row[1].split(/(?<!\\)\|/).map((c) => unescape(c.trim()));
    /* Header and alignment rows carry nothing. */
    if (cells.every((c) => !c || /^:?-+:?$/.test(c))) continue;
    /* A checkbox in the first cell and the item beside it is how the
       follow-up lists are laid out. */
    if (cells.length >= 2 && CHECKBOX_ONLY.test(cells[0])) {
      const rest = cells.slice(1).filter(Boolean).join(" ");
      if (rest) out.push(`☐ ${rest}`);
      continue;
    }
    for (const c of cells) if (c) out.push(...splitRunOn(c));
  }
  return out.join("\n");
}

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
    /* An item that named its own family keeps it; the rest take the note's. */
    for (const i of one.items) items.push({ ...i, client: i.client !== undefined ? i.client : one.client });
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

/**
 * One note read straight from Google Drive, for the weekly sweep.
 *
 * The family comes from the file's title and nowhere else. A title is what
 * Skylar chose to call the note; the body mentions other families all the
 * time, and a supervision prep mentions four of them, so scanning the body
 * for a name files items under whichever family happened to be mentioned
 * first. A note whose title names nobody keeps its items unattached, except
 * for lines that open with a family's name as a label.
 *
 * This is the whole of the extraction. The routine that finds the notes only
 * copies their text; it does not decide what counts as an item, because when
 * it did, the same note gave different items on different runs.
 */
export function extractFromSource({ title, text, families, today }) {
  const client = detectFamily(String(title || ""), families, { titles: true, fuzzy: true });
  const { items } = extractFromNote(normaliseNoteText(text), { families, today, client });
  return {
    client,
    items: items.map((i) => ({ ...i, client: i.client !== undefined ? i.client : client })),
  };
}

export function extractFromNote(text, { families, today, client: given } = {}) {
  const lines = String(text || "").split(/\r?\n/);

  /* The family is usually the first thing on the page (the pseudonym, then
     "Visit Notes"), so the title line is asked first and alone. It used to be
     folded into the first six lines, which meant a longer name mentioned in
     the first item could outrank the one in the title; and the title is the
     only place a nickname that doubles as an ordinary word can be trusted.
     Then the opening lines, then the whole note. A caller that already knows
     the family (the sweep, from the file's title) passes it, and then none of
     this guessing happens. */
  let client = given;
  if (given === undefined) {
    const title = lines.find((l) => l.trim()) || "";
    const head = lines.slice(0, 6).join(" ");
    client =
      detectFamily(title, families, { titles: true }) ||
      detectFamily(head, families) ||
      detectFamily(text, families);
  }

  const items = [];
  let section = null;
  let pending = null; // a checkbox on its own line, with the text below it

  const push = (raw, sec) => {
    const body = raw.replace(CHECKBOX, "").replace(BULLET, "").trim();
    if (body.length < 8) return;
    if (isNilAnswer(body)) return;
    const flag = !!sec?.urgent && !NOT_A_FLAG.test(body);
    const text2 = simplify(body, { keepLong: flag });
    const item = {
      text: text2,
      note: body === text2 ? "" : body,
      lane: sec?.lane || "sky",
      kind: sec?.kind || detectKind(body),
      due: detectDue(body, today),
      section: sec?.urgent && !flag ? "Watch item" : sec?.label || "From the note",
      urgent: flag,
      /* "Bring to the clinical partner" is literally the teaming agenda. */
      agenda: !!sec?.agenda,
    };
    const own = familyFromLabel(body, families);
    if (own !== undefined) item.client = own;
    items.push(item);
  };

  for (const raw of lines) {
    const line = raw.replace(/[\u00A0\u2007\u202F]/g, " ");
    if (!line.trim()) continue;

    /* Supervision lines carry their own role, and the role says which room
       the line is for. [team] is Thursday with Mo: an ordinary teaming item,
       counted, listed and printed with the rest of the clinician's list.
       [individual] and [group] are for reflective supervision, which is a
       different meeting: they used to land on Thursday's list or sit among a
       family's to-dos, and neither is where anyone looks for them. They are
       their own kind, kept off the families' to-do lists and counts. */
    const sup = line.match(SUPERVISION);
    if (sup) {
      const role = (sup[1] || sup[2]).toLowerCase();
      const body = line.replace(SUPERVISION, "").trim();
      if (body.length >= 8) {
        const item = {
          text: simplify(body),
          note: body,
          lane: role === "individual" ? "sky" : "both",
          kind: role === "team" ? "cpp" : "supervision",
          forum: role,
          due: null,
          section: role === "team" ? "For teaming" : role === "group" ? "For group supervision" : "For my supervision",
          urgent: false,
          agenda: role === "team",
        };
        const own = familyFromLabel(body, families);
        if (own !== undefined) item.client = own;
        items.push(item);
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

    /* A heading with its answer on the same line: "Safety flags: none
       disclosed in this memo." Read whole, it was either taken for a heading
       and its answer thrown away, or, when longer, missed as a heading
       altogether. The part before the colon opens the section; the part
       after is read as the first line under it. */
    const inline = line.match(/^\s*(?:\d+\.\s*)?([^:]{3,40}):\s+(\S.*)$/);
    if (inline && !CHECKBOX.test(line)) {
      const opens = sectionFor(inline[1]);
      if (opens) {
        section = opens;
        pending = null;
        push(inline[2], section);
        continue;
      }
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
    /* Which supervision a supervision line is for; absent on everything else. */
    ...(i.forum ? { forum: i.forum } : {}),
    done: false,
    seed: false,
  }));
}
