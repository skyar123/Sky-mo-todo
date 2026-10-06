/* Ticking something off, as motion.

   A ticked row used to vanish on the tap. Nothing confirms it went where it
   should, and a list that loses a line under your thumb reads as a list that
   loses things. Now the change is made on the board at once (so it syncs and
   can be undone), while on screen the row stays where it was for a moment:
   the box fills, the check pops, the row fades slowly and folds away, and the
   item then glides from where it was into the Done list below.

   A list keeps a row in place while `leaving` has its id, renders it in its
   Done list once it is gone from there, and passes `arrive(id)` as that Done
   row's ref so it starts from where the ticked row was. */

import { useCallback, useEffect, useRef, useState } from "react";

/* The check, a beat to see it, then a slow fade. Matches .skmo-leaving. */
export const LEAVE_MS = 1400;
const GLIDE_MS = 650;

const reducedMotion = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

const rowOf = (id) =>
  typeof document === "undefined" ? null : document.querySelector(`[data-row="${String(id).replace(/"/g, '\\"')}"]`);

export function useSettle() {
  const [leaving, setLeaving] = useState(() => new Set());
  const [arriving, setArriving] = useState(() => new Map());
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms));

  /** Make the change now; let the row go gently. */
  const settle = useCallback((id, change) => {
    change();
    /* A short buzz where the phone has one (Android; iPhones ignore it). */
    try { navigator.vibrate?.(12); } catch { /* not allowed here */ }
    if (reducedMotion()) return;
    const from = rowOf(id)?.getBoundingClientRect().top;
    setLeaving((s) => new Set(s).add(id));
    later(() => {
      setLeaving((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
      if (from !== undefined) setArriving((m) => new Map(m).set(id, from));
      later(() => setArriving((m) => {
        const next = new Map(m);
        next.delete(id);
        return next;
      }), GLIDE_MS + 1200);
    }, LEAVE_MS);
  }, []);

  /** The ref for a row in a Done list: glide in from where it was ticked. */
  const arrive = useCallback((id) => (el) => {
    if (!el || !arriving.has(id) || el.dataset.glided === "1") return;
    el.dataset.glided = "1";
    const dy = arriving.get(id) - el.getBoundingClientRect().top;
    el.animate?.(
      [{ transform: `translateY(${dy}px)`, opacity: 0.35 }, { transform: "translateY(0)", opacity: 1 }],
      { duration: GLIDE_MS, easing: "cubic-bezier(.2,.8,.2,1)" }
    );
  }, [arriving]);

  return {
    settle,
    arrive,
    isLeaving: (id) => leaving.has(id),
    isArriving: (id) => arriving.has(id),
  };
}

/** When something was ticked: its own stamp where it has one. */
export const doneAt = (t) => t?.at?.done || t?.updatedAt || 0;
