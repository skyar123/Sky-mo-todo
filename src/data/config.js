/* Build-time settings, and the one of them that can be changed without a deploy.

   The Google client id is a public identifier, not a secret: every OAuth web
   app ships it in the page. It names a Google Cloud project and is useless
   without the authorised origin, which is the deployed URL.

   It is settable from the board's settings because getting it right is a fiddly
   job done in Google's console, and a wrong one should cost a retype rather
   than a rebuild. A value saved here wins over the one baked in at build time. */

import { readJSON, writeJSON, remove } from "../lib/storage.js";

const KEY = "google-client-id";

/* The sky+mo Google Cloud project. An earlier id here named a project inside
   somebody else's Workspace and Google refused every sign-in with
   org_internal, which is why the settings screen can override this one: a
   wrong id should cost a retype, not a rebuild. */
const BUILT_IN =
  import.meta.env.VITE_GOOGLE_CLIENT_ID ||
  "891188470243-lrh1p84q19bunj48gd5tgng2uk112ch7.apps.googleusercontent.com";

/* Google's own shape: digits, a dash, a token, then the suffix. Checked so a
   half-copied string is refused here rather than failing inside a popup. */
const SHAPE = /^[0-9]+-[A-Za-z0-9_]+\.apps\.googleusercontent\.com$/;

export const isClientId = (v) => SHAPE.test(String(v || "").trim());

/** The client id in force right now. */
export function clientId() {
  const saved = readJSON(KEY);
  return isClientId(saved) ? saved.trim() : BUILT_IN;
}

export const haveClientId = () => !!clientId();

/** Point this device at a different Google project. Empty restores the default. */
export function setClientId(value) {
  const v = String(value || "").trim();
  if (!v) {
    remove(KEY);
    return BUILT_IN;
  }
  if (!isClientId(v)) throw new Error("That does not look like a client id");
  writeJSON(KEY, v);
  return v;
}

export const isCustomClientId = () => isClientId(readJSON(KEY));

export const BUILT_IN_CLIENT_ID = BUILT_IN;
