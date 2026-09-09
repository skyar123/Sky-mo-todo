import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readJSON, writeJSON } from "./storage.js";
import { daysBetween, parseISO } from "./dates.js";
import { toShared, fromShared } from "./shared.js";
import { syncOnce, writeToken } from "./sync.js";

const KEY = "board-v3";
const SCHEMA = 3;
const SENT_KEEP_DAYS = 60;

/* A seeded task saves only what a person actually changed. Ticking it saves
   the tick; editing its wording saves that field too, but every field left
   alone is read fresh from the caseload on each load. That way updating the
   source file still reaches the board instead of being masked forever by a
   stale saved copy, while a real edit is never quietly reverted. */
const EDITABLE = ["text", "due", "note", "client", "kind"];

function pickSeedState(task, original) {
  const state = { done: !!task.done, lane: task.lane, updatedAt: task.updatedAt || 0 };
  if (!original) return state;
  for (const k of EDITABLE) {
    if (task[k] !== original[k]) state[k] = task[k];
  }
  return state;
}

function hydrate(seedTasks, saved) {
  const seedState = saved?.seedState || {};
  const seeded = seedTasks.map((t) => {
    const s = seedState[t.id];
    if (!s) return t;
    const merged = { ...t, done: !!s.done, lane: s.lane || t.lane, updatedAt: s.updatedAt || 0 };
    for (const k of EDITABLE) {
      if (Object.prototype.hasOwnProperty.call(s, k)) merged[k] = s[k];
    }
    return merged;
  });
  const user = Array.isArray(saved?.userTasks) ? saved.userTasks.filter((t) => t && t.id) : [];
  return [...user, ...seeded];
}

/* Reminder bookkeeping is keyed by "<familyId><YYYY-MM-DD>". Old keys are
   dead weight, so they are dropped rather than accumulating forever. */
function pruneSent(sent, today) {
  const out = {};
  for (const [k, v] of Object.entries(sent || {})) {
    if (!v) continue;
    const d = parseISO(k.slice(-10));
    if (!d || daysBetween(d, today) <= SENT_KEEP_DAYS) out[k] = v;
  }
  return out;
}

export function useBoard(caseload, today, crypto) {
  const { families, seedTasks } = caseload;
  const originals = useMemo(() => new Map(seedTasks.map((t) => [t.id, t])), [seedTasks]);

  const [tasks, setTasks] = useState(() => hydrate(seedTasks, null));
  const [sent, setSent] = useState({});
  const [supplies, setSupplies] = useState(() =>
    Object.fromEntries(families.map((c) => [c.id, c.supplies || []]))
  );
  const [drops, setDrops] = useState({});
  const [tombstones, setTombstones] = useState({});
  /* When this device last changed each sent / supplies / drops entry. Without
     this, a reload would present untouched entries as brand new. */
  const [stamps, setStamps] = useState({ sent: {}, supplies: {}, drops: {} });
  const [ready, setReady] = useState(false);
  const [syncState, setSyncState] = useState(crypto?.key ? "idle" : "off");
  const [lastSync, setLastSync] = useState(null);
  const saveRef = useRef(null);
  const revRef = useRef(0);
  const tokenRef = useRef(null);
  const busyRef = useRef(false);
  const dirtyRef = useRef(false);

  /* Load once, after the caseload is unlocked. */
  useEffect(() => {
    const saved = readJSON(KEY);
    if (saved && saved.v === SCHEMA) {
      setTasks(hydrate(seedTasks, saved));
      setSent(pruneSent(saved.sent, today));
      if (saved.supplies) {
        setSupplies((p) => ({ ...p, ...saved.supplies }));
      }
      if (saved.drops) setDrops(saved.drops);
      if (saved.tombstones) setTombstones(saved.tombstones);
      if (saved.stamps) setStamps({ sent: {}, supplies: {}, drops: {}, ...saved.stamps });
    }
    setReady(true);
    // Runs once per unlock; the caseload does not change underneath us.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Debounced save. Nothing is written until the first load has settled,
     so an empty initial state can never overwrite real saved work. */
  useEffect(() => {
    if (!ready) return undefined;
    clearTimeout(saveRef.current);
    saveRef.current = setTimeout(() => {
      writeJSON(KEY, {
        v: SCHEMA,
        seedState: Object.fromEntries(
          tasks.filter((t) => t.seed).map((t) => [t.id, pickSeedState(t, originals.get(t.id))])
        ),
        userTasks: tasks.filter((t) => !t.seed),
        sent,
        supplies,
        drops,
        tombstones,
        stamps,
      });
    }, 400);
    return () => clearTimeout(saveRef.current);
  }, [tasks, sent, supplies, drops, tombstones, stamps, ready, originals]);

  /* Every change is stamped. The merge is newest-wins per entry, so an
     unstamped edit would lose to whatever the other person did last. */
  const touch = useCallback((id, patch) => {
    dirtyRef.current = true;
    setTasks((p) =>
      p.map((x) => (x.id === id ? { ...x, ...(typeof patch === "function" ? patch(x) : patch), updatedAt: Date.now() } : x))
    );
  }, []);

  const mark = useCallback((group, key) => {
    dirtyRef.current = true;
    setStamps((p) => ({ ...p, [group]: { ...p[group], [key]: Date.now() } }));
  }, []);

  const toggle = useCallback((id) => touch(id, (x) => ({ done: !x.done })), [touch]);
  const setLaneOf = useCallback((id, lane) => touch(id, { lane }), [touch]);
  const remove = useCallback((id) => {
    let removed = null;
    dirtyRef.current = true;
    setTasks((p) => {
      const i = p.findIndex((x) => x.id === id);
      if (i < 0) return p;
      removed = { task: p[i], index: i };
      return [...p.slice(0, i), ...p.slice(i + 1)];
    });
    /* Without a tombstone the other device's copy would put it straight back
       on the next sync. */
    setTombstones((p) => ({ ...p, [id]: Date.now() }));
    return () => {
      if (!removed) return;
      setTombstones((p) => {
        const next = { ...p };
        delete next[removed.task.id];
        return next;
      });
      setTasks((p) => {
        if (p.some((x) => x.id === removed.task.id)) return p;
        const next = [...p];
        next.splice(Math.min(removed.index, next.length), 0, { ...removed.task, updatedAt: Date.now() });
        return next;
      });
    };
  }, []);
  const add = useCallback((made) => {
    dirtyRef.current = true;
    const at = Date.now();
    setTasks((p) => [...made.map((t) => ({ ...t, updatedAt: at })), ...p]);
  }, []);

  /* Field-level edit. Used by the inline editor, so every keystroke lands on
     the task itself and the debounced save picks it up. */
  const update = useCallback((id, patch) => touch(id, patch), [touch]);

  /* Quick add straight into a family, without opening the paste sheet. */
  const addQuick = useCallback(
    ({ text, client, lane = "both", kind = "care", due = null }) => {
      const task = {
        id: `u${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        client: client || null,
        lane, kind, text: text.trim(), due, note: "", done: false, seed: false,
      };
      dirtyRef.current = true;
      setTasks((p) => [{ ...task, updatedAt: Date.now() }, ...p]);
      return task;
    },
    []
  );

  const toggleSupply = useCallback((famId, item) => {
    mark("supplies", famId);
    setSupplies((p) => {
      const cur = p[famId] || [];
      return { ...p, [famId]: cur.includes(item) ? cur.filter((x) => x !== item) : [...cur, item] };
    });
  }, [mark]);

  /* --- sharing ---------------------------------------------------------
     Two people, one board. The server holds ciphertext and a revision number;
     everything here is about merging rather than overwriting.

     State is read through a ref so the sync callback keeps a stable identity.
     Otherwise every keystroke would rebuild it and restart the timers. */
  const stateRef = useRef(null);
  stateRef.current = { tasks, sent, supplies, drops, tombstones, stamps };

  const runSync = useCallback(async () => {
    if (!crypto?.key || busyRef.current) return;
    busyRef.current = true;
    setSyncState("syncing");
    try {
      if (!tokenRef.current) tokenRef.current = await writeToken(crypto.key);
      const local = toShared(stateRef.current, originals);
      const { doc, rev } = await syncOnce(local, {
        key: crypto.key,
        token: tokenRef.current,
        salt: crypto.salt,
        rev: revRef.current,
      });
      revRef.current = rev;
      dirtyRef.current = false;

      const next = fromShared(doc, seedTasks);
      setTasks(next.tasks);
      setSent(next.sent);
      setSupplies((p) => ({ ...p, ...next.supplies }));
      setDrops(next.drops);
      setTombstones(next.tombstones);
      setStamps(next.stamps);
      setSyncState("idle");
      setLastSync(Date.now());
    } catch {
      /* A failed sync must never cost local work. The board keeps what it has
         and tries again. */
      setSyncState(typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "error");
    } finally {
      busyRef.current = false;
    }
  }, [crypto, originals, seedTasks]);

  /* First sync once the local board has loaded, then whenever the phone comes
     back to the screen, and on a slow timer in case it never leaves. */
  useEffect(() => {
    if (!ready || !crypto?.key) return undefined;
    runSync();
    const onWake = () => {
      if (document.visibilityState === "visible") runSync();
    };
    const timer = setInterval(runSync, 45000);
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("online", runSync);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("online", runSync);
    };
  }, [ready, crypto, runSync]);

  /* Push soon after a change, so the other person sees it without waiting for
     the timer, but not on every keystroke. */
  useEffect(() => {
    if (!ready || !crypto?.key || !dirtyRef.current) return undefined;
    const t = setTimeout(runSync, 2500);
    return () => clearTimeout(t);
  }, [tasks, sent, supplies, drops, tombstones, stamps, ready, crypto, runSync]);

  /* Wrapped so a caller cannot set one of these without recording when. */
  const markedSetSent = useCallback(
    (updater) =>
      setSent((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        for (const k of Object.keys(next)) {
          if (next[k] !== prev[k]) mark("sent", k);
        }
        return next;
      }),
    [mark]
  );

  const markedSetDrops = useCallback(
    (updater) =>
      setDrops((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        for (const k of Object.keys(next)) {
          if (next[k] !== prev[k]) mark("drops", k);
        }
        return next;
      }),
    [mark]
  );

  const exportBlob = useCallback(
    () => ({
      exported: new Date().toISOString(),
      v: SCHEMA,
      seedState: Object.fromEntries(
        tasks.filter((t) => t.seed).map((t) => [t.id, pickSeedState(t, originals.get(t.id))])
      ),
      userTasks: tasks.filter((t) => !t.seed),
      sent,
      supplies,
      drops,
    }),
    [tasks, sent, supplies, drops, originals]
  );

  const importBlob = useCallback(
    (blob) => {
      if (!blob || blob.v !== SCHEMA) throw new Error("That file is not a sky+mo backup.");
      setTasks(hydrate(seedTasks, blob));
      setSent(pruneSent(blob.sent, today));
      setSupplies((p) => ({ ...p, ...(blob.supplies || {}) }));
      setDrops(blob.drops || {});
    },
    [seedTasks, today]
  );

  const openTasks = useMemo(() => tasks.filter((t) => !t.done), [tasks]);

  return {
    ready, tasks, openTasks, sent, supplies, drops,
    setSent: markedSetSent, setDrops: markedSetDrops, toggle, setLaneOf, remove, add, addQuick, update, toggleSupply,
    exportBlob, importBlob,
    shared: !!crypto?.key, syncState, lastSync, syncNow: runSync,
  };
}
