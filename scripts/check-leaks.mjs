#!/usr/bin/env node
/* Guards the one rule that matters: nothing readable from the caseload may
   appear in anything that gets published. That means dist/ (deployed) and
   every file git tracks (the repo is public), including this project's own
   tests and comments.

   Checked three ways, from the plaintext itself rather than a hand-written
   word list, so new content is covered automatically:

     1. whole strings      - any caseload sentence appearing verbatim
     2. six-word windows   - a fragment of a note surviving into the bundle
     3. identity tokens    - names, children, aliases

   Ordinary English is not interesting on its own, so single common words are
   deliberately not flagged; a six-word run of them never collides by accident. */

import { readdir, readFile, stat } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
/* The built output to check. Defaults to dist/, but anything that is about to
   be put at a public address should be checkable, whatever it is called. */
const DIST = path.resolve(root, process.argv[2] || "dist");
const MIN_TOKEN = 4;   // shorter tokens collide with minified identifiers
const NGRAM = 6;

async function walk(dir) {
  const out = [];
  for (const name of await readdir(dir)) {
    const full = path.join(dir, name);
    if ((await stat(full)).isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

async function loadPlaintext() {
  try {
    const m = await import(`file://${path.join(root, "data/caseload.source.mjs")}`);
    return { families: m.families, blocks: m.blocks, seedTasks: m.seedTasks };
  } catch {
    /* fall through to the JSON copy */
  }
  try {
    return JSON.parse(await readFile(path.join(root, "data/caseload.local.json"), "utf8"));
  } catch {
    return null;
  }
}

const data = await loadPlaintext();

/* A build machine has no plaintext to compare against, and that is the point:
   the plaintext never leaves the authoring machine. Nothing to check, so say
   so plainly rather than reporting a pass that was never performed. */
if (!data) {
  console.log("Leak check SKIPPED: no plaintext caseload on this machine, nothing to compare against.");
  console.log("  The check runs where the plaintext lives, before anything is committed.");
  process.exit(0);
}

const strings = [];
const collect = (v) => {
  if (typeof v === "string") strings.push(v);
  else if (Array.isArray(v)) v.forEach(collect);
  else if (v && typeof v === "object") Object.values(v).forEach(collect);
};
collect(data);

const norm = (s) => s.toLowerCase().replace(/\s+/g, " ").trim();

/* 1. whole strings worth checking */
const sentences = new Set(strings.map(norm).filter((s) => s.length >= 25));

/* 2. six-word windows out of the longer free text */
const ngrams = new Set();
for (const s of strings) {
  const w = norm(s).split(/[^a-z0-9']+/).filter(Boolean);
  for (let i = 0; i + NGRAM <= w.length; i++) ngrams.add(w.slice(i, i + NGRAM).join(" "));
}

/* 3. the identifying tokens. A few caseload fields hold plain words rather
   than names ("first visit", "not scheduled"), which are not giveaways. */
const NOT_A_NAME = new Set(["first", "visit", "turns", "scheduled", "home", "office", "standing", "slot"]);
const identity = new Set();
for (const f of data.families) {
  for (const raw of [f.name, f.child, ...(f.alias || [])]) {
    for (const w of String(raw || "").split(/[^A-Za-z]+/)) {
      const low = w.toLowerCase();
      if (low.length >= MIN_TOKEN && !NOT_A_NAME.has(low)) identity.add(low);
    }
  }
}

/* Everything published: the built output plus every tracked file. */
const candidates = new Set();
try {
  for (const f of await walk(DIST)) candidates.add(f);
} catch {
  /* no dist yet; the tracked-files pass still runs */
}
const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" })
  .split("\0")
  .filter(Boolean);
for (const rel of tracked) candidates.add(path.join(root, rel));

const bundles = [];
for (const f of candidates) {
  if (/\.(png|ico|woff2?|ttf|svg|jpg|jpeg|gif|webp)$/i.test(f)) continue;
  if (path.basename(f) === "caseload.enc.json") continue;   // ciphertext by definition
  if (path.basename(f) === "check-leaks.mjs") continue;      // this file names the rules
  if (path.basename(f) === "package-lock.json") continue;    // dependency names only
  let text;
  try {
    text = await readFile(f, "utf8");
  } catch {
    continue; // unreadable or vanished between listing and reading
  }
  bundles.push({
    f: path.relative(root, f),
    raw: text.toLowerCase(),
    words: norm(text.replace(/[^A-Za-z0-9']+/g, " ")),
  });
}

const leaks = [];
const flag = (kind, needle, file) => leaks.push({ kind, needle, file });

for (const s of sentences) {
  for (const b of bundles) if (b.raw.includes(s)) { flag("sentence", s.slice(0, 60) + "…", b.f); break; }
}
for (const g of ngrams) {
  for (const b of bundles) if (b.words.includes(g)) { flag("phrase", g, b.f); break; }
}
for (const t of identity) {
  const re = new RegExp(`(^|[^a-z0-9])${t}([^a-z0-9]|$)`);
  for (const b of bundles) if (re.test(b.raw)) { flag("name", t, b.f); break; }
}

console.log(
  `Checked ${sentences.size} sentences, ${ngrams.size} phrases and ${identity.size} names ` +
  `against ${bundles.length} published files (dist/ plus everything git tracks).`
);

if (leaks.length) {
  console.error(`\nFAIL: ${leaks.length} caseload item(s) readable in published files:`);
  for (const l of leaks.slice(0, 30)) console.error(`  [${l.kind}] "${l.needle}"  in ${l.file}`);
  if (leaks.length > 30) console.error(`  … and ${leaks.length - 30} more`);
  process.exit(1);
}
console.log("PASS: nothing readable from the caseload is in anything published.");
