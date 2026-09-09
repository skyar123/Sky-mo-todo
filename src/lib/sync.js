/* Talking to the shared board.

   The endpoint stores an opaque string. Everything readable is encrypted here,
   with the same key the passcode already derived, so the server holds
   ciphertext and the two people sharing the board hold the key.

   Every write is optimistic: send the revision you last saw, and if the server
   has moved on it hands back what it has instead of taking the write. The
   answer to that is always merge and retry, never overwrite. */

import { encryptWithKey, decryptWithKey, exportKey, toB64 } from "./crypto.js";
import { mergeShared } from "./shared.js";

const ENDPOINT = "/api/board";
const RETRIES = 4;

/* Derived from the same key, so whoever can read the board can write to it and
   nobody else can. Not a secret from the two of them; a gate against a
   passer-by who found the URL. */
export async function writeToken(key) {
  const raw = await exportKey(key);
  const bytes = new TextEncoder().encode(`skymo-write:${raw}`);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return toB64(digest);
}

export async function pull(key) {
  const res = await fetch(ENDPOINT, { cache: "no-store" });
  if (!res.ok) throw new Error(`pull ${res.status}`);
  const { rev, blob } = await res.json();
  if (!blob) return { rev: rev || 0, doc: null };
  try {
    return { rev, doc: await decryptWithKey(JSON.parse(blob), key) };
  } catch {
    /* Written under a different passcode, or corrupt. Treat the remote as
       absent rather than wiping what is on this device. */
    return { rev, doc: null, unreadable: true };
  }
}

async function put(doc, rev, key, token, salt) {
  const payload = await encryptWithKey(doc, key, salt);
  const res = await fetch(ENDPOINT, {
    method: "PUT",
    headers: { "content-type": "application/json", "x-skymo-token": token },
    body: JSON.stringify({ rev, blob: JSON.stringify(payload) }),
  });
  if (res.status === 409) return { conflict: await res.json() };
  if (!res.ok) throw new Error(`push ${res.status}`);
  return { ok: await res.json() };
}

/**
 * Merge this device's document with the shared one and store the result.
 * Returns the merged document so the caller can render it.
 */
export async function syncOnce(localDoc, { key, token, salt, rev }) {
  let known = rev;
  let merged = localDoc;

  for (let attempt = 0; attempt < RETRIES; attempt++) {
    const remote = await pull(key);
    known = remote.rev;
    merged = remote.doc ? mergeShared(remote.doc, localDoc) : localDoc;

    /* Nothing of ours to add and the remote is readable: just take theirs. */
    const result = await put(merged, known, key, token, salt);
    if (result.ok) return { doc: merged, rev: result.ok.rev, pushed: true };

    /* Someone wrote between our read and our write. Go round again. */
    localDoc = merged;
  }
  return { doc: merged, rev: known, pushed: false };
}
