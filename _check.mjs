import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
const api = spawn("node", ["tests/api-stub.mjs"], { stdio: "inherit", env: { ...process.env, PORT: "4174" } });
const web = spawn("npx", ["vite", "preview", "--port", "4173", "--strictPort"], { stdio: "inherit", env: process.env });
await sleep(6000);
for (const u of ["http://localhost:4174/api/board", "http://localhost:4173/api/board"]) {
  try {
    const r = await fetch(u, { signal: AbortSignal.timeout(4000) });
    const t = await r.text();
    console.log(`${u} -> ${r.status} ${t.slice(0, 50).replace(/\s+/g, " ")}`);
  } catch (e) { console.log(`${u} -> THREW ${e.message}`); }
}
web.kill(); api.kill();
process.exit(0);
