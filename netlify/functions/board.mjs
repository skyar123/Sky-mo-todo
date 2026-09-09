/* Shared board state for two people.

   This function is deliberately dumb. It stores one opaque string and a
   revision number, and it never sees anything readable: the browser encrypts
   with the key derived from the passcode before sending, and decrypts after
   receiving. Netlify holds ciphertext, exactly like the caseload file does.

   Writes are guarded by a token the client derives from the same passcode.
   Anyone who should be using this board already knows it; the point is to
   stop a passer-by who found the URL from overwriting real work. */

import { getStore } from "@netlify/blobs";

const KEY = "board";
const MAX_BYTES = 2_000_000;

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

/* Strong consistency: two people ticking things a few seconds apart should
   see each other, not a stale read from a minute ago. */
const store = () => getStore({ name: "skymo-board", consistency: "strong" });

export default async function handler(req) {
  const expected = process.env.SKYMO_WRITE_TOKEN;

  if (req.method === "GET") {
    const hit = await store().get(KEY, { type: "json" });
    return json(200, hit || { rev: 0, blob: null });
  }

  if (req.method === "PUT") {
    if (!expected) return json(503, { error: "Sync is not configured on this site." });
    if (req.headers.get("x-skymo-token") !== expected) return json(403, { error: "Not allowed." });

    let body;
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "Bad body." });
    }

    const { rev, blob } = body || {};
    if (typeof blob !== "string" || !blob) return json(400, { error: "Missing blob." });
    if (blob.length > MAX_BYTES) return json(413, { error: "Too large." });
    if (!Number.isInteger(rev) || rev < 0) return json(400, { error: "Missing rev." });

    const current = (await store().get(KEY, { type: "json" })) || { rev: 0, blob: null };

    /* Optimistic concurrency. The client that is behind is told so and given
       the current state to merge against, rather than silently clobbering
       whatever the other person just did. */
    if (rev !== current.rev) return json(409, current);

    const next = { rev: current.rev + 1, blob, at: new Date().toISOString() };
    await store().setJSON(KEY, next);
    return json(200, { rev: next.rev, at: next.at });
  }

  return json(405, { error: "Method not allowed." });
}

export const config = { path: "/api/board" };
