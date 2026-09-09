#!/usr/bin/env node
/* Builds, serves the built output, runs the browser suites, then tears down. */

import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = process.env.PORT || 4173;
const API_PORT = process.env.API_PORT || 4174;
const BASE = `http://localhost:${PORT}`;

/* The shared board lives behind a Netlify Function, which vite does not serve.
   The stub speaks the same contract so the sharing behaviour can be driven
   here instead of only in production. */
const TOKEN = process.env.SKYMO_WRITE_TOKEN || "test-token";
const childEnv = {
  ...process.env,
  SKYMO_WRITE_TOKEN: TOKEN,
  SKYMO_API_TARGET: `http://localhost:${API_PORT}`,
};

const run = (cmd, args, opts = {}) =>
  new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: "inherit", shell: false, ...opts });
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });

const api = spawn("node", ["tests/api-stub.mjs"], {
  stdio: "ignore",
  env: { ...childEnv, PORT: String(API_PORT) },
});

const server = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], {
  stdio: "ignore",
  env: childEnv,
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

/* The board endpoint must actually reach the stub. If the proxy is not wired,
   the SPA fallback answers with HTML and a 200, the client throws parsing it,
   and the sharing tests fail in a way that looks like a sync bug. */
async function assertApiProxy() {
  const res = await fetch(`${BASE}/api/board`, { signal: AbortSignal.timeout(4000) });
  const text = await res.text();
  if (!text.trimStart().startsWith("{")) {
    throw new Error(
      `/api/board did not reach the stub: got ${res.status} ${text.slice(0, 40).replace(/\s+/g, " ")}. ` +
        `Is SKYMO_API_TARGET set for the preview server?`
    );
  }
}

let failed = false;
try {
  await waitForServer();
  await assertApiProxy();
  console.log("\n— end to end —");
  await run("node", ["tests/e2e.mjs"], { env: { ...childEnv, BASE } });
  console.log("\n— offline —");
  await run("node", ["tests/offline.mjs"], { env: { ...childEnv, BASE } });
  console.log("\n— sharing —");
  await run("node", ["tests/sharing.mjs"], { env: { ...childEnv, BASE } });
} catch (err) {
  console.error("\n" + err.message);
  failed = true;
} finally {
  server.kill();
  api.kill();
}
process.exit(failed ? 1 : 0);
