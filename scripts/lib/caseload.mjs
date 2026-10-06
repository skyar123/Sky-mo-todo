/* Which caseload a script opens, and so which key it holds.

   Every script that reads or writes the board decrypts the caseload first,
   because the board is encrypted with the caseload's key. If two scripts
   took the caseload from different places they could disagree about which
   board they are opening, and a write with the wrong key replaces everyone's
   work with a board nobody's phone can read. So there is one rule, here:
   --caseload if given (a path or a URL), the site's copy when the script is
   pointed at another site with --site, and the repository's otherwise. The
   repository's is the default because the routine runs from a fresh clone,
   so a new admission date or family name counts as soon as it is committed,
   before the site has been deployed again. */

import { readFile } from "node:fs/promises";
import { decryptJSON } from "../../src/lib/crypto.js";

export const DEFAULT_SITE = "https://sky-mo-caseload.netlify.app";

/** Command-line flags into an object; `withValue` lists the ones that take one. */
export function parseArgs(argv, withValue) {
  const opts = {};
  const loose = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (withValue.includes(a)) { opts[a] = argv[++i]; continue; }
    if (a.startsWith("--")) opts[a] = true;
    else loose.push(a);
  }
  return { opts, loose };
}

export const siteOf = (opts) => opts["--site"] || DEFAULT_SITE;

export async function openCaseload(opts, passcode) {
  const where = opts["--caseload"] || (opts["--site"] ? `${opts["--site"]}/caseload.enc.json` : null);
  let enc;
  if (where && /^https?:\/\//.test(where)) {
    const res = await fetch(where, { cache: "no-store" });
    if (!res.ok) throw new Error(`could not read the caseload: ${res.status}`);
    enc = await res.json();
  } else {
    enc = JSON.parse(await readFile(where || new URL("../../public/caseload.enc.json", import.meta.url), "utf8"));
  }
  const { data, key } = await decryptJSON(enc, passcode);
  return { enc, data, key };
}

/**
 * The board as the server holds it, decrypted. Throws rather than returning
 * an empty board when it cannot be read: a script that carried on with an
 * empty board would report every ticked step as still owed, or write over
 * the real one.
 */
export async function readBoard(endpoint, key, decryptWithKey) {
  const res = await fetch(endpoint, { cache: "no-store" });
  if (!res.ok) throw new Error(`could not read the board: ${res.status}`);
  const { rev, blob } = await res.json();
  return { rev, doc: blob ? await decryptWithKey(JSON.parse(blob), key) : null };
}
