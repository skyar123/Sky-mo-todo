#!/usr/bin/env node
/* A stand-in for the Netlify Function, so the sharing behaviour can be driven
   in a browser locally. It implements the same contract as
   netlify/functions/board.mjs: one blob, one revision, optimistic writes.
   Deliberately in-memory, because the tests want a clean board each run. */

import { createServer } from "node:http";

const TOKEN = process.env.SKYMO_WRITE_TOKEN || "test-token";
let state = { rev: 0, blob: null };

const send = (res, status, body) => {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(payload);
};

createServer((req, res) => {
  if (!req.url.startsWith("/api/board")) return send(res, 404, { error: "no" });

  if (req.method === "GET") return send(res, 200, state);

  /* Tests share one stub, so each file that cares about the shared board asks
     for a clean one first. Without this, an earlier file's ticks arrive as
     someone else's edits and the assertions read as failures. */
  if (req.method === "DELETE") {
    state = { rev: 0, blob: null };
    return send(res, 200, state);
  }

  if (req.method === "PUT") {
    if (req.headers["x-skymo-token"] !== TOKEN) return send(res, 403, { error: "Not allowed." });
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        return send(res, 400, { error: "Bad body." });
      }
      const { rev, blob } = body || {};
      if (typeof blob !== "string" || !blob) return send(res, 400, { error: "Missing blob." });
      if (!Number.isInteger(rev) || rev < 0) return send(res, 400, { error: "Missing rev." });
      if (rev !== state.rev) return send(res, 409, state);
      state = { rev: state.rev + 1, blob, at: new Date().toISOString() };
      send(res, 200, { rev: state.rev, at: state.at });
    });
    return undefined;
  }
  return send(res, 405, { error: "Method not allowed." });
}).listen(Number(process.env.PORT) || 5198, () => {
  console.log(`api stub on ${process.env.PORT || 5198}`);
});
