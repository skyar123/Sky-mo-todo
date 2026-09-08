#!/usr/bin/env node
/* Rebuilds the plaintext caseload from the encrypted payload, so the
   encrypted file can be the only copy that survives a fresh clone.
   Writes data/caseload.local.json, which is gitignored. */

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { decryptJSON } from "../src/lib/crypto.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const IN = path.join(root, "public/caseload.enc.json");
const OUT = path.join(root, "data/caseload.local.json");

const passcode = process.env.SKYMO_PASSCODE;
if (!passcode) {
  console.error("SKYMO_PASSCODE is not set.");
  process.exit(1);
}

const payload = JSON.parse(await readFile(IN, "utf8"));
let data;
try {
  ({ data } = await decryptJSON(payload, passcode));
} catch {
  console.error("Could not decrypt. Wrong passcode, or the file has been altered.");
  process.exit(1);
}

await writeFile(OUT, JSON.stringify(data, null, 2) + "\n", "utf8");
console.log(`Decrypted -> data/caseload.local.json`);
console.log(`  families ${data.families.length}  blocks ${data.blocks.length}  tasks ${data.seedTasks.length}`);
