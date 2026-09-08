#!/usr/bin/env node
/* Turns the plaintext caseload into the encrypted payload that ships.
   Reads data/caseload.source.mjs (preferred) or data/caseload.local.json.
   Writes public/caseload.enc.json, which is the only form that is ever
   committed or deployed.

   Passcode comes from SKYMO_PASSCODE. */

import { readFile, writeFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { encryptJSON } from "../src/lib/crypto.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC_MJS = path.join(root, "data/caseload.source.mjs");
const SRC_JSON = path.join(root, "data/caseload.local.json");
const OUT = path.join(root, "public/caseload.enc.json");

const exists = async (p) => access(p).then(() => true, () => false);

async function loadPlaintext() {
  if (await exists(SRC_MJS)) {
    const m = await import(`file://${SRC_MJS}`);
    return {
      from: "data/caseload.source.mjs",
      data: { families: m.families, blocks: m.blocks, seedTasks: m.seedTasks },
    };
  }
  if (await exists(SRC_JSON)) {
    return { from: "data/caseload.local.json", data: JSON.parse(await readFile(SRC_JSON, "utf8")) };
  }
  throw new Error(
    "No plaintext caseload found. Expected data/caseload.source.mjs or data/caseload.local.json.\n" +
      "If you only have the encrypted file, run: npm run data:decrypt"
  );
}

function validate({ families, blocks, seedTasks }) {
  const problems = [];
  if (!Array.isArray(families) || !families.length) problems.push("families is empty");
  if (!Array.isArray(blocks)) problems.push("blocks is not an array");
  if (!Array.isArray(seedTasks) || !seedTasks.length) problems.push("seedTasks is empty");
  if (problems.length) return problems;

  const famIds = new Set();
  for (const f of families) {
    if (!f.id || !f.name) problems.push(`family missing id or name: ${JSON.stringify(f).slice(0, 60)}`);
    if (famIds.has(f.id)) problems.push(`duplicate family id: ${f.id}`);
    famIds.add(f.id);
    if (typeof f.day !== "number" || f.day < 0 || f.day > 6) problems.push(`${f.id}: day out of range`);
    for (const k of ["supplies", "goals", "watch", "alias"]) {
      if (!Array.isArray(f[k])) problems.push(`${f.id}: ${k} must be an array`);
    }
  }

  const taskIds = new Set();
  for (const t of seedTasks) {
    if (taskIds.has(t.id)) problems.push(`duplicate task id: ${t.id}`);
    taskIds.add(t.id);
    if (t.client && !famIds.has(t.client)) problems.push(`task ${t.id} points at unknown family ${t.client}`);
    if (!["sky", "mo", "both"].includes(t.lane)) problems.push(`task ${t.id}: bad lane ${t.lane}`);
    if (t.due && !/^\d{4}-\d{2}-\d{2}$/.test(t.due)) problems.push(`task ${t.id}: bad due date ${t.due}`);
  }
  return problems;
}

const passcode = process.env.SKYMO_PASSCODE;
if (!passcode) {
  console.error("SKYMO_PASSCODE is not set. Refusing to encrypt with an unknown passcode.");
  process.exit(1);
}

const { from, data } = await loadPlaintext();
const problems = validate(data);
if (problems.length) {
  console.error("Caseload did not validate:");
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}

const payload = await encryptJSON(data, passcode);
await writeFile(OUT, JSON.stringify(payload, null, 2) + "\n", "utf8");

const bytes = JSON.stringify(payload).length;
console.log(`Encrypted ${from}`);
console.log(`  families ${data.families.length}  blocks ${data.blocks.length}  tasks ${data.seedTasks.length}`);
console.log(`  -> public/caseload.enc.json (${(bytes / 1024).toFixed(1)} kB, ${payload.iter.toLocaleString()} KDF iterations)`);
