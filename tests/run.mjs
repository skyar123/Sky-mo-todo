#!/usr/bin/env node
/* Builds, serves the built output, runs the browser suites, then tears down. */

import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = process.env.PORT || 4173;
const BASE = `http://localhost:${PORT}`;

const run = (cmd, args, opts = {}) =>
  new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: "inherit", shell: false, ...opts });
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });

const server = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], {
  stdio: "ignore",
});

async function waitForServer(tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(BASE, { signal: AbortSignal.timeout(1000) });
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }
  throw new Error("preview server never came up");
}

let failed = false;
try {
  await waitForServer();
  console.log("\n— end to end —");
  await run("node", ["tests/e2e.mjs"], { env: { ...process.env, BASE } });
  console.log("\n— offline —");
  await run("node", ["tests/offline.mjs"], { env: { ...process.env, BASE } });
} catch (err) {
  console.error("\n" + err.message);
  failed = true;
} finally {
  server.kill();
}
process.exit(failed ? 1 : 0);
