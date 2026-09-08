/* Caseload encryption.
   The deployed bundle ships ciphertext only; the passcode never leaves the
   device and is never stored alongside the data. AES-256-GCM gives us
   tamper detection for free: a wrong passcode fails to decrypt rather than
   returning plausible garbage, which is what makes the unlock check honest.

   Runs unmodified in Node 22 and in the browser, so the build script and the
   app agree on the format by construction. */

export const KDF_ITERATIONS = 600_000; // OWASP guidance for PBKDF2-HMAC-SHA256
const SUBTLE = () => globalThis.crypto.subtle;

const enc = new TextEncoder();
const dec = new TextDecoder();

export const toB64 = (bytes) => {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s);
};

export const fromB64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

/** Stretch a passcode into an AES key. Deliberately slow. */
export async function deriveKey(passcode, salt, iterations = KDF_ITERATIONS) {
  const base = await SUBTLE().importKey("raw", enc.encode(passcode), "PBKDF2", false, ["deriveKey"]);
  return SUBTLE().deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    true, // extractable, so an unlocked device can cache the key instead of the passcode
    ["encrypt", "decrypt"]
  );
}

export async function encryptJSON(data, passcode, iterations = KDF_ITERATIONS) {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passcode, salt, iterations);
  const ct = await SUBTLE().encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(data)));
  return {
    v: 1,
    kdf: "PBKDF2-SHA256",
    cipher: "AES-256-GCM",
    iter: iterations,
    salt: toB64(salt),
    iv: toB64(iv),
    ct: toB64(ct),
  };
}

/** Throws if the passcode is wrong. That is the point. */
export async function decryptWithKey(payload, key) {
  const plain = await SUBTLE().decrypt(
    { name: "AES-GCM", iv: fromB64(payload.iv) },
    key,
    fromB64(payload.ct)
  );
  return JSON.parse(dec.decode(plain));
}

export async function decryptJSON(payload, passcode) {
  const key = await deriveKey(passcode, fromB64(payload.salt), payload.iter || KDF_ITERATIONS);
  const data = await decryptWithKey(payload, key);
  return { data, key };
}

/* Caching the derived key lets "remember this device" skip a 600k-iteration
   stretch on every load, and keeps the passcode itself out of storage. */
export async function exportKey(key) {
  return toB64(await SUBTLE().exportKey("raw", key));
}

export async function importKey(b64) {
  return SUBTLE().importKey("raw", fromB64(b64), { name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
}
