/* Everything this app remembers lives in this browser and nowhere else.
   Every call is guarded: private mode, disabled site data and full quota
   all throw, and none of them should ever take the board down. */

const PREFIX = "skymo:";

export function readJSON(key, fallback = null) {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJSON(key, value) {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function remove(key) {
  try {
    window.localStorage.removeItem(PREFIX + key);
  } catch {
    /* nothing to remove */
  }
}

export function available() {
  try {
    const probe = PREFIX + "__probe";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}
