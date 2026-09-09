#!/usr/bin/env node
/* Post-processes the built service worker:
     - stamps a fresh cache version so old caches are retired
     - injects the real hashed asset names to precache

   Precaching matters more than it looks. Without it the first offline open
   serves the shell with no JavaScript behind it, which is a blank screen in
   a living room with no signal. */

import { readdir, readFile, writeFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(root, "dist");
const target = path.join(DIST, "sw.js");

async function walk(dir, base = "") {
  const out = [];
  for (const name of await readdir(dir)) {
    const full = path.join(dir, name);
    const rel = `${base}/${name}`;
    if ((await stat(full)).isDirectory()) out.push(...(await walk(full, rel)));
    else out.push(rel);
  }
  return out;
}

const all = await walk(DIST);
const precache = [
  "/",
  ...all.filter((p) => p !== "/sw.js" && p !== "/robots.txt" && !p.startsWith("/api/")),
].sort();

const id = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
let src = await readFile(target, "utf8");

for (const token of ["__BUILD_ID__", "__PRECACHE__"]) {
  if (!src.includes(token)) {
    console.error(`sw.js has no ${token} placeholder; refusing to ship a broken worker.`);
    process.exit(1);
  }
}

src = src.replace("__BUILD_ID__", id).replace("__PRECACHE__", JSON.stringify(precache));
await writeFile(target, src, "utf8");

console.log(`Service worker stamped: skymo-${id}`);
console.log(`  precaching ${precache.length}: ${precache.join(" ")}`);
