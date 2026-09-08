import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readJSON, writeJSON } from "./storage.js";
import { daysBetween, parseISO } from "./dates.js";

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
  const state = { done: !!task.done, lane: task.lane };
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
    const merged = { ...t, done: !!s.done, lane: s.lane || t.lane };
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

export function useBoard(caseload, today) {
  const { families, seedTasks } = caseload;
  const originals = useMemo(() => new Map(seedTasks.map((t) => [t.id, t])), [seedTasks]);

  const [tasks, setTasks] = useState(() => hydrate(seedTasks, null));
  const [sent, setSent] = useState({});
  const [supplies, setSupplies] = useState(() =>
    Object.fromEntries(families.map((c) => [c.id, c.supplies || []]))
  );
  const [drops, setDrops] = useState({});
  const [ready, setReady] = useState(false);
  const saveRef = useRef(null);

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
      });
    }, 400);
    return () => clearTimeout(saveRef.current);
  }, [tasks, sent, supplies, drops, ready, originals]);

  const toggle = useCallback(
    (id) => setTasks((p) => p.map((x) => (x.id === id ? { ...x, done: !x.done } : x))),
    []
  );
  const setLaneOf = useCallback(
    (id, lane) => setTasks((p) => p.map((x) => (x.id === id ? { ...x, lane } : x))),
    []
  );
  const remove = useCallback((id) => {
    let removed = null;
    setTasks((p) => {
      const i = p.findIndex((x) => x.id === id);
      if (i < 0) return p;
      removed = { task: p[i], index: i };
      return [...p.slice(0, i), ...p.slice(i + 1)];
    });
    return () => {
      if (!removed) return;
      setTasks((p) => {
        if (p.some((x) => x.id === removed.task.id)) return p;
        const next = [...p];
        next.splice(Math.min(removed.index, next.length), 0, removed.task);
        return next;
      });
    };
  }, []);
  const add = useCallback((made) => setTasks((p) => [...made, ...p]), []);

  /* Field-level edit. Used by the inline editor, so every keystroke lands on
     the task itself and the debounced save picks it up. */
  const update = useCallback(
    (id, patch) => setTasks((p) => p.map((x) => (x.id === id ? { ...x, ...patch } : x))),
    []
  );

  /* Quick add straight into a family, without opening the paste sheet. */
  const addQuick = useCallback(
    ({ text, client, lane = "both", kind = "care", due = null }) => {
      const task = {
        id: `u${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        client: client || null,
        lane, kind, text: text.trim(), due, note: "", done: false, seed: false,
      };
      setTasks((p) => [task, ...p]);
      return task;
    },
    []
  );

  const toggleSupply = useCallback(
    (famId, item) =>
      setSupplies((p) => {
        const cur = p[famId] || [];
        return { ...p, [famId]: cur.includes(item) ? cur.filter((x) => x !== item) : [...cur, item] };
      }),
    []
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
    setSent, setDrops, toggle, setLaneOf, remove, add, addQuick, update, toggleSupply,
    exportBlob, importBlob,
  };
}
