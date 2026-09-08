#!/usr/bin/env node
/* Verifies every link in the share library actually resolves.

   The Share tab tells families these links were checked, so they have to have
   been. Some hosts block unfamiliar clients, so a browser user agent is used
   and 403/429 are reported as "blocked, not confirmed dead" rather than being
   silently treated as either working or broken. */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

const src = await readFile(path.join(root, "src/data/library.js"), "utf8");
const urls = [...new Set([...src.matchAll(/url:\s*"([^"]+)"/g)].map((m) => m[1]))];

console.log(`Checking ${urls.length} links from the share library.\n`);

const dead = [];
const blocked = [];

for (const url of urls) {
  await sleep(2500); // these hosts rate limit, and a 429 tells us nothing
  let code = "ERR";
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": UA, Accept: "text/html,*/*" },
      signal: AbortSignal.timeout(30000),
    });
    code = res.status;
  } catch {
    code = "ERR";
  }
  let verdict = "ok";
  if (code === 404 || code === 410) {
    verdict = "DEAD";
    dead.push({ url, code });
  } else if (code === 403 || code === 429 || code === "ERR") {
    verdict = "blocked";
    blocked.push({ url, code });
  }
  console.log(`  ${String(code).padEnd(4)} ${verdict.padEnd(8)} ${url}`);
}

console.log("");
if (dead.length) {
  console.log(`${dead.length} link(s) are gone and must be replaced:`);
  for (const d of dead) console.log(`  ${d.url}`);
  process.exit(1);
}
if (blocked.length) {
  console.log(`${blocked.length} link(s) refused an automated request. Not proof of a dead link; open them by hand:`);
  for (const b of blocked) console.log(`  ${b.code} ${b.url}`);
}
console.log("No dead links.");
