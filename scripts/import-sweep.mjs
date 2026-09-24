#!/usr/bin/env node
/* The weekly sweep, written straight onto the shared board.

   The board is encrypted with a key derived from the passcode, and the write
   token is derived from that same key, so the only thing that can add a task
   is something holding the passcode. That is the property that lets a caseload
   live on a public host at all, and it is why this step cannot happen on the
   server: the server has never been able to read a word of it.

   So the routine does it. It already reads every visit note in full, so the
   passcode does not widen what it can see, only what it can write. It reads
   the passcode from SKYMO_PASSCODE and writes nowhere else.

   Two ways in:

     node import-sweep.mjs --notes <dir> [--dry]
       One file per Drive note, each starting with a line
         Source: <drive file id> | <modified time> | <file title>
       followed by the note's text exactly as Drive gave it. This is how the
       routine calls it. The routine only copies text; this script decides
       what is an item, with the same parser the app uses.

     node import-sweep.mjs <doc.txt> [--dry]
       One document of "<Name>: Visit Notes" blocks, the older shape. Kept for
       pasting by hand and for anything still calling it that way.

   --site URL points at another board (the tests use it); --caseload overrides
   where the family names come from.

   Running twice adds nothing the second time. That matters more than it
   sounds: a routine that doubles the board on a retry is worse than one that
   does not run. */

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { decryptJSON, decryptWithKey, encryptWithKey } from "../src/lib/crypto.js";
import { writeToken } from "../src/lib/sync.js";
import { mergeShared } from "../src/lib/shared.js";
import { extractFromDoc, extractFromSource, itemsToTasks } from "../src/lib/extract.js";

const TAKES_VALUE = new Set(["--site", "--endpoint", "--caseload", "--notes"]);
const opts = {};
const loose = [];
for (let i = 0; i < process.argv.length - 2; i++) {
  const a = process.argv[i + 2];
  if (TAKES_VALUE.has(a)) { opts[a] = process.argv[i + 3]; i++; continue; }
  if (a.startsWith("--")) { opts[a] = true; continue; }
  loose.push(a);
}

const SITE = opts["--site"] || "https://sky-mo-caseload.netlify.app";
const ENDPOINT = opts["--endpoint"] || `${SITE}/api/board`;
/* The families and their names come from the copy of the caseload that sits
   beside this script, not from the deployed site. They used to come from the
   site, which meant a name added to the caseload did nothing for the sweep
   until the next deploy; and a deploy can be stuck for days. The routine
   clones this repository fresh on every run, so reading the file next door
   means a new name reaches the sweep the moment it is committed. Passing
   --caseload (a URL or a path) still overrides it. */
const CASELOAD = opts["--caseload"] || (opts["--site"] ? `${SITE}/caseload.enc.json` : null);
const LOCAL_CASELOAD = new URL("../public/caseload.enc.json", import.meta.url);
const DRY = !!opts["--dry"];
const NOTES = opts["--notes"];
const RETRIES = 4;

/* Bumped when the parser changes what it takes out of a note. A note already
   imported under an older version is read again, and what the new reading no
   longer finds is retired, so a parser fix reaches notes already on the board
   instead of only the next week's. */
const PARSER = 2;

if (!NOTES && !loose[0]) {
  console.error("usage: node import-sweep.mjs --notes <dir> [--dry]\n   or: node import-sweep.mjs <doc.txt> [--dry]");
  process.exit(2);
}

const passcode = process.env.SKYMO_PASSCODE;
if (!passcode) {
  console.error("SKYMO_PASSCODE is not set. Nothing was written.");
  process.exit(2);
}

/* The caseload is the same encrypted payload the app loads, so the families
   and their names are read from the one file that holds them. */
async function loadCaseload() {
  if (CASELOAD && /^https?:\/\//.test(CASELOAD)) {
    const res = await fetch(CASELOAD, { cache: "no-store" });
    if (!res.ok) throw new Error(`could not read the caseload: ${res.status}`);
    return res.json();
  }
  return JSON.parse(await readFile(CASELOAD || LOCAL_CASELOAD, "utf8"));
}
const enc = await loadCaseload();
const { data, key } = await decryptJSON(enc, passcode);
const families = data.families;
const salt = enc.salt;
const familyName = (id) => families.find((f) => f.id === id)?.name || "no family";

/* Same id for the same item, so a second reading of the same words is a
   no-op rather than a double. */
const hash = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16);
const idFor = (t) => "sweep_" + hash(`${t.client || "none"}|${t.text}`);

/* The record of which version of which note has already been read. It lives
   on the board as an entry shaped like a deletion, because that is the one
   shape every build of the app already carries through a sync untouched: the
   build on the phones today keeps the board's copy of a deletion when the two
   are equally recent, and never writes when nothing differs. The app shows
   nothing for it. */
const ledgerId = (sourceId) => "src_" + hash(sourceId);

/* ---- what to import ---------------------------------------------------- */

/** One entry per note: where it came from and the tasks it yields. */
async function readSources() {
  if (!NOTES) {
    const text = await readFile(loose[0], "utf8");
    const { items, families: blocks } = extractFromDoc(text, { families, today: new Date() });
    const tasks = itemsToTasks(items, { client: null }).map((t) => ({ ...t, id: idFor(t) }));
    return [{ source: null, title: path.basename(loose[0]), tasks, blocks }];
  }

  const out = [];
  const names = (await readdir(NOTES)).filter((n) => /\.(txt|md)$/i.test(n)).sort();
  for (const name of names) {
    const raw = await readFile(path.join(NOTES, name), "utf8");
    const [first, ...rest] = raw.split(/\r?\n/);
    const m = first.match(/^\s*Source:\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*(.+?)\s*$/i);
    if (!m) {
      console.log(`   ${name}: no "Source: id | modified | title" line at the top, skipped`);
      continue;
    }
    const [, id, modified, title] = m;
    const { client: noteFamily, items } = extractFromSource({ title, text: rest.join("\n"), families, today: new Date() });
    /* When the visit was, as a day: the date in the title where there is one,
       since editing an old note later changes when it was modified but not
       which visit it was about. The day it was last changed otherwise. */
    const noted = (title.match(/\d{4}-\d{2}-\d{2}/) || [String(modified).slice(0, 10)])[0];
    const tasks = itemsToTasks(items, { client: null }).map((t) => ({
      ...t,
      id: idFor(t),
      source: id,
      noted,
      /* A visit note for this family: its title named them. A line labelled
         for another family, or anything in a supervision prep, is not. */
      fromVisit: !!noteFamily && t.client === noteFamily,
    }));
    out.push({ source: { id, modified }, noted, title, tasks });
  }
  /* Oldest visit first, so that when two notes produce the same item, the
     newer note is the one it ends up belonging to. */
  return out.sort((a, b) => (a.noted + a.source.modified).localeCompare(b.noted + b.source.modified));
}

const sources = await readSources();

if (NOTES) {
  for (const s of sources) {
    const per = new Map();
    for (const t of s.tasks) per.set(familyName(t.client), (per.get(familyName(t.client)) || 0) + 1);
    const summary = [...per].map(([k, n]) => `${k} ${n}`).join(", ") || "nothing to add";
    console.log(`${s.title}: ${s.tasks.length} item(s) (${summary})`);
  }
} else {
  /* The older one-document shape reports the way it always has; the routine
     and anything else reading this output were written against it. */
  const { tasks, blocks } = sources[0];
  const per = new Map();
  for (const t of tasks) per.set(familyName(t.client), (per.get(familyName(t.client)) || 0) + 1);
  console.log(`${tasks.length} item(s) across ${blocks} block(s):`);
  for (const [k, n] of per) console.log(`   ${k}: ${n}`);
  if (!tasks.length) {
    console.log("No follow-up items in that document. Nothing written.");
    process.exit(0);
  }
}
const unplaced = sources.flatMap((s) => s.tasks).filter((t) => !t.client).length;
if (unplaced) console.log(`${unplaced} could not be matched to a family and will need one picked by hand`);

if (DRY) {
  console.log("--dry: nothing written.");
  process.exit(0);
}

/* ---- writing it -------------------------------------------------------- */

const token = await writeToken(key);
const stamp = Date.now();

/* A deletion the sweep itself made (a stranded copy moved to its family, an
   item a later reading of the note no longer finds) is not a person's
   decision, so the same item may come back if a note produces it again. A
   deletion by a person is final. */
const sweepRetired = (e) => e?.deleted && e.by === "sweep";

/* Nobody has touched it since the sweep wrote it: not ticked, not edited, not
   moved. Anything else is someone's work, and the sweep leaves it alone. */
const untouched = (e) => e && !e.deleted && e.by === "sweep" && !e.task?.done;

/* The fields a reading of a note decides. When a note is read again and an
   untouched item is still in it, these are brought up to date from the new
   reading; text and family are the item's id, so they cannot differ. */
const READ_FIELDS = ["kind", "lane", "agenda", "urgent", "note", "due", "forum", "source", "noted", "fromVisit"];
const differs = (a, b) => READ_FIELDS.some((k) => JSON.stringify(a?.[k] ?? null) !== JSON.stringify(b?.[k] ?? null));

function plan(remote) {
  const mine = { v: 1, tasks: {}, sent: {}, supplies: {}, drops: {} };
  const report = { added: 0, kept: 0, refreshed: 0, retired: 0, adopted: 0, alreadyRead: 0, read: 0 };
  const tasksOn = remote?.tasks || {};
  const retire = (id) => {
    mine.tasks[id] = { deleted: true, updatedAt: stamp, by: "sweep" };
  };

  /* Which notes this run actually reads: a version already read by this
     parser is skipped whole. However its text comes out this time, it was
     imported once, and once is the whole point. */
  const reading = sources.filter((s) => {
    if (!s.source) return true;
    const prior = tasksOn[ledgerId(s.source.id)]?.source;
    const done = prior && prior.modified === s.source.modified && prior.parser === PARSER;
    if (done) report.alreadyRead++;
    return !done;
  });

  /* Every item some note still asks for: everything this run's notes
     produce, and everything the notes it is not rereading produced last
     time. An item is only retired when no note claims it any more. Checking
     one note at a time retired an item one note dropped while another note
     still had it. */
  const readingIds = new Set(reading.filter((s) => s.source).map((s) => s.source.id));
  const claimed = new Set(reading.flatMap((s) => s.tasks.map((t) => t.id)));
  for (const e of Object.values(tasksOn)) {
    if (e?.source?.items && !readingIds.has(e.source.id)) for (const id of e.source.items) claimed.add(id);
  }

  for (const s of reading) {
    report.read++;
    const lid = s.source ? ledgerId(s.source.id) : null;
    const prior = lid ? tasksOn[lid]?.source : null;
    const now = new Set();

    for (const t of s.tasks) {
      now.add(t.id);
      const existing = mine.tasks[t.id] && !mine.tasks[t.id].deleted ? mine.tasks[t.id] : tasksOn[t.id];

      if (existing && !sweepRetired(existing)) {
        /* Already on the board. If nobody has touched it and this reading is
           from the same or a newer visit, it takes this reading's details,
           which is how a line a newer note repeats word for word comes to
           belong to that newer note rather than being taken for an earlier
           visit's leftover. It never moves back to an older note. */
        const was = existing.task;
        const newer = !was?.noted || !t.noted || t.noted >= was.noted;
        if (untouched(existing) && newer && differs(was, t)) {
          mine.tasks[t.id] = { seed: false, task: { ...was, ...pick(t) }, updatedAt: stamp, by: "sweep" };
          report.refreshed++;
        } else {
          report.kept++;
        }
        continue;
      }

      mine.tasks[t.id] = { seed: false, task: t, updatedAt: stamp, by: "sweep" };
      report.added++;

      /* The same item, imported earlier before its family's name was known,
         sits on the board with no family. The id comes from the family and
         the text, so the placed copy has a new id and the stranded one would
         stay behind as a duplicate. Retire it, if nobody has touched it. */
      if (t.client) {
        const strandedId = idFor({ ...t, client: null });
        if (strandedId !== t.id && untouched(tasksOn[strandedId]) && !tasksOn[strandedId].task?.client) {
          retire(strandedId);
          report.adopted++;
        }
      }
    }

    /* The note was read before, and has changed since (or the parser has).
       What the earlier reading added and no note asks for any more goes,
       unless someone has worked on it. */
    if (prior) {
      for (const id of prior.items || []) {
        if (!now.has(id) && !claimed.has(id) && untouched(tasksOn[id])) {
          retire(id);
          report.retired++;
        }
      }
    }

    if (lid) {
      mine.tasks[lid] = {
        deleted: true,
        updatedAt: stamp,
        by: "sweep",
        source: { id: s.source.id, modified: s.source.modified, parser: PARSER, items: [...now] },
      };
    }
  }
  return { mine, report };
}

const pick = (t) => Object.fromEntries(READ_FIELDS.filter((k) => k in t).map((k) => [k, t[k]]));

/* Optimistic, exactly as the app does it: read, work out what is missing,
   write against the revision we read, and start over if someone beat us. */
let wrote = false;
for (let attempt = 0; attempt < RETRIES; attempt++) {
  const res = await fetch(ENDPOINT, { cache: "no-store" });
  if (!res.ok) throw new Error(`pull ${res.status}`);
  const { rev, blob } = await res.json();

  /* The caseload is read from the repository rather than the site, so it is
     possible, in principle, for the two to disagree about the key. If this
     key cannot open the board, writing would replace everyone's work with a
     board nobody's phone can read. Stop instead. */
  let remote = null;
  if (blob) {
    try {
      remote = await decryptWithKey(JSON.parse(blob), key);
    } catch {
      console.error(
        "The shared board cannot be opened with this caseload's key, so nothing was written.\n" +
          "The caseload in the repository and the one on the site no longer match."
      );
      process.exit(1);
    }
  }

  const { mine, report } = plan(remote);
  const changed = Object.keys(mine.tasks).length > 0;

  if (!changed) {
    if (NOTES) {
      console.log(`Nothing new: ${report.alreadyRead} note(s) already read, ${report.kept} item(s) already on the board.`);
    } else {
      console.log(`Nothing new: all ${report.kept} item(s) are already on the board.`);
    }
    process.exit(0);
  }

  /* Written in the form the app itself settles into. A new entry with no
     per-field times gets them added by the first phone that syncs, which
     makes that phone write once after every sweep for no reason. Merging the
     sweep's own changes with themselves produces exactly that settled form,
     using the app's merge rather than a copy of its rules. */
  const settled = mergeShared(mine, mine);
  const merged = remote ? mergeShared(remote, settled) : settled;
  const payload = await encryptWithKey(merged, key, salt);
  const put = await fetch(ENDPOINT, {
    method: "PUT",
    headers: { "content-type": "application/json", "x-skymo-token": token },
    body: JSON.stringify({ rev, blob: JSON.stringify(payload) }),
  });
  if (put.status === 409) continue; // someone wrote first; read again
  if (!put.ok) throw new Error(`push ${put.status}`);
  const out = await put.json();

  console.log(`Added ${report.added} item(s) to the board (revision ${rev} -> ${out.rev}).`);
  if (report.adopted) console.log(`${report.adopted} of them had been sitting with no family from an earlier sweep; moved to their family.`);
  if (report.retired) console.log(`${report.retired} item(s) an earlier reading of a changed note had added were retired.`);
  if (report.refreshed) console.log(`${report.refreshed} already there were updated from a newer reading of their note.`);
  if (report.kept) console.log(`${report.kept} were already there and were left alone.`);
  if (NOTES && report.alreadyRead) console.log(`${report.alreadyRead} note(s) had already been read and were skipped.`);
  wrote = true;
  break;
}

if (!wrote) {
  console.error("The board kept changing under us. Nothing was written; try again.");
  process.exit(1);
}
