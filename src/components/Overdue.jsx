import React, { useState } from "react";
import { S, LINE, HOT } from "../styles.js";
import { iso, addDays, dueInfo, fmtShort } from "../lib/dates.js";
import { nextVisitFor } from "../lib/schedule.js";
import { useSettle } from "../lib/useSettle.js";
import { Archive } from "./Archive.jsx";
import { DONE_PILL } from "./Task.jsx";

/* What has gone past its date, and a way through it.

   A due date that has been red for a fortnight has stopped meaning anything:
   it is not a prompt any more, it is furniture. Clearing the pile mattered,
   but doing it meant opening each task inside its own family and typing a new
   date, ten times over, which is not something anyone does between visits. So
   they are all on one screen, and the answer to each is one tap.

   The three answers are the three that actually come up: it happened and was
   never ticked, it still needs doing and the next chance is the next visit,
   or it is not happening and should stop asking. Nothing is deleted here
   except by the same rule as everywhere else: a task from the caseload file
   loses its date, it does not vanish. */

/** Open tasks whose date has already passed, longest overdue first. */
export function overdueTasks(tasks, today) {
  return tasks
    .filter((t) => {
      if (t.done || !t.due) return false;
      const d = dueInfo(t.due, today);
      return d && d.days < 0;
    })
    .sort((a, b) => a.due.localeCompare(b.due));
}

export function Overdue({ tasks, familyById, today, board, events, detectFamily, onOpenFamily, onOpenLoose, onFlash, onBack }) {
  /* What has been dealt with on this visit to the screen, newest first, with
     how and the date it had, so each one can be put back. A row fades where
     it was and then joins this list, rather than vanishing under the thumb. */
  const [cleared, setCleared] = useState([]);
  const settle = useSettle();
  const rows = overdueTasks(tasks, today);
  const clearedIds = new Set(cleared.map((c) => c.task.id));
  const fading = cleared.filter((c) => settle.isLeaving(c.task.id)).map((c) => ({ ...c.task, _fading: c }));
  const left = [...rows.filter((t) => !clearedIds.has(t.id)), ...fading].sort((a, b) => a.due.localeCompare(b.due));
  const settled = cleared.filter((c) => !settle.isLeaving(c.task.id));

  const act = (t, change, how, message) => {
    settle.settle(t.id, () => {
      change();
      setCleared((p) => [{ task: { ...t, at: { ...(t.at || {}), done: Date.now() } }, how, message }, ...p]);
    });
    onFlash?.(message);
  };
  const putBack = (c) => {
    if (c.how === "done") board.toggle(c.task.id);
    else board.update(c.task.id, { due: c.task.due });
    setCleared((p) => p.filter((x) => x !== c));
    onFlash?.("Put back");
  };
  const open = rows.filter((t) => !clearedIds.has(t.id)).length;

  return (
    <>
      <button onClick={onBack} style={S.back}>‹ back</button>
      <div style={S.h1}>Past due</div>
      <div style={S.sub}>
        {open
          ? `${open} ${open === 1 ? "thing has" : "things have"} gone past their date. One tap each.`
          : "Nothing is past its date."}
      </div>

      {rows.length === 0 && cleared.length === 0 && (
        <div style={S.empty}>
          Nothing has gone past its date. Anything that does turns up here
          rather than sitting red on the day screen.
        </div>
      )}

      {open === 0 && cleared.length > 0 && !fading.length && (
        <div style={S.empty}>That is the pile cleared.</div>
      )}

      {left.map((t) => {
        const family = t.client ? familyById.get(t.client) : null;
        const d = dueInfo(t.due, today);
        const next = nextVisitFor(family, addDays(today, 1), events, detectFamily);
        const done = t._fading?.how === "done";

        return (
          <div
            key={t.id}
            data-overdue={t._fading ? undefined : t.id}
            data-row={t.id}
            className={t._fading ? "skmo-leaving" : undefined}
            style={{ borderBottom: `1px solid ${LINE}`, padding: "12px 0" }}
          >
            <div style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
              <span
                style={{ ...S.dot, marginTop: 5, background: family ? family.color : "#B9AECE" }}
                aria-hidden="true"
              />
              <button
                onClick={() => (family ? onOpenFamily(family.id, t) : onOpenLoose?.())}
                style={{
                  flex: 1, textAlign: "left", background: "transparent", border: "none",
                  padding: 0, fontFamily: "inherit", color: "inherit", cursor: "pointer",
                  fontSize: 13.5, lineHeight: 1.45, textDecoration: done ? "line-through" : "none",
                }}
              >
                {family && <span style={{ fontWeight: 700 }}>{family.name} · </span>}
                {t.text}
              </button>
              {t._fading ? (
                <span style={{ ...S.pill, ...DONE_PILL }}>
                  <span className="skmo-check">✓</span> {t._fading.how === "done" ? "done" : "moved"}
                </span>
              ) : (
                <span style={{ ...S.pill, background: HOT, color: "#fff", borderColor: HOT }}>{d.label}</span>
              )}
            </div>

            {!t._fading && (
              <div style={{ ...S.rowWrap, marginTop: 9, marginBottom: 0 }}>
                <button
                  onClick={() => act(t, () => board.toggle(t.id), "done", "Ticked off")}
                  style={{ ...S.mini, ...S.miniOn }}
                >
                  Done
                </button>

                {next ? (
                  <button
                    onClick={() => act(t, () => board.update(t.id, { due: iso(next) }), "moved", `Moved to ${fmtShort(next)}`)}
                    style={S.mini}
                  >
                    Next visit · {fmtShort(next)}
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      const when = addDays(today, 7);
                      act(t, () => board.update(t.id, { due: iso(when) }), "moved", `Moved to ${fmtShort(when)}`);
                    }}
                    style={S.mini}
                  >
                    Next week
                  </button>
                )}

                <button
                  onClick={() => act(t, () => board.update(t.id, { due: null }), "undated", "Date cleared, still on the board")}
                  style={S.mini}
                >
                  No date
                </button>
              </div>
            )}
          </div>
        );
      })}

      <Archive
        title="Cleared just now"
        rows={settled.map((c) => ({ ...c.task, _cleared: c }))}
        settle={settle}
        render={(t) => {
          const family = t.client ? familyById.get(t.client) : null;
          return (
            <div style={{ display: "flex", gap: 9, alignItems: "center", padding: "9px 0", borderBottom: `1px solid ${LINE}` }}>
              <span style={{ ...S.dot, background: family ? family.color : "#B9AECE" }} aria-hidden="true" />
              {/* A line-through reaches every child, so what happened to it
                  sits beside the struck text rather than inside it. */}
              <span style={{ flex: 1, fontSize: 13, lineHeight: 1.4 }}>
                <span style={{ display: "block", opacity: 0.6, textDecoration: t._cleared.how === "done" ? "line-through" : "none" }}>
                  {family && <span style={{ fontWeight: 700 }}>{family.name} · </span>}
                  {t.text}
                </span>
                <span style={{ display: "block", fontSize: 11.5, color: "#1F6B43", marginTop: 2 }}>{t._cleared.message}</span>
              </span>
              <button onClick={() => putBack(t._cleared)} style={S.mini}>Undo</button>
            </div>
          );
        }}
      />

      {rows.length > 0 && (
        <div style={{ ...S.tip, marginTop: 18 }}>
          Clearing a date leaves the task on the board under its family. It stops
          asking; it does not go away.
        </div>
      )}
    </>
  );
}
