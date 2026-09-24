import React, { useState } from "react";
import { S, LINE, HOT } from "../styles.js";
import { iso, addDays, dueInfo, fmtShort } from "../lib/dates.js";
import { nextVisitFor } from "../lib/schedule.js";

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
  /* Rows leave the list as they are dealt with, so the pile visibly shrinks.
     Re-reading the board each render would make them vanish mid-tap instead,
     which reads as the app losing things. */
  const [handled, setHandled] = useState(() => new Set());
  const rows = overdueTasks(tasks, today);
  const left = rows.filter((t) => !handled.has(t.id));

  const settle = (id, message) => {
    setHandled((p) => new Set(p).add(id));
    onFlash?.(message);
  };

  return (
    <>
      <button onClick={onBack} style={S.back}>‹ back</button>
      <div style={S.h1}>Past due</div>
      <div style={S.sub}>
        {left.length
          ? `${left.length} ${left.length === 1 ? "thing has" : "things have"} gone past their date. One tap each.`
          : "Nothing is past its date."}
      </div>

      {rows.length === 0 && (
        <div style={S.empty}>
          Nothing has gone past its date. Anything that does turns up here
          rather than sitting red on the day screen.
        </div>
      )}

      {rows.length > 0 && left.length === 0 && (
        <div style={S.empty}>That is the pile cleared.</div>
      )}

      {left.map((t) => {
        const family = t.client ? familyById.get(t.client) : null;
        const d = dueInfo(t.due, today);
        const next = nextVisitFor(family, addDays(today, 1), events, detectFamily);

        return (
          <div key={t.id} data-overdue={t.id} style={{ borderBottom: `1px solid ${LINE}`, padding: "12px 0" }}>
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
                  fontSize: 13.5, lineHeight: 1.45,
                }}
              >
                {family && <span style={{ fontWeight: 700 }}>{family.name} · </span>}
                {t.text}
              </button>
              <span style={{ ...S.pill, background: HOT, color: "#fff", borderColor: HOT }}>{d.label}</span>
            </div>

            <div style={{ ...S.rowWrap, marginTop: 9, marginBottom: 0 }}>
              <button
                onClick={() => { board.toggle(t.id); settle(t.id, "Ticked off"); }}
                style={{ ...S.mini, ...S.miniOn }}
              >
                Done
              </button>

              {next ? (
                <button
                  onClick={() => { board.update(t.id, { due: iso(next) }); settle(t.id, `Moved to ${fmtShort(next)}`); }}
                  style={S.mini}
                >
                  Next visit · {fmtShort(next)}
                </button>
              ) : (
                <button
                  onClick={() => {
                    const when = addDays(today, 7);
                    board.update(t.id, { due: iso(when) });
                    settle(t.id, `Moved to ${fmtShort(when)}`);
                  }}
                  style={S.mini}
                >
                  Next week
                </button>
              )}

              <button
                onClick={() => { board.update(t.id, { due: null }); settle(t.id, "Date cleared, still on the board"); }}
                style={S.mini}
              >
                No date
              </button>
            </div>
          </div>
        );
      })}

      {rows.length > 0 && (
        <div style={{ ...S.tip, marginTop: 18 }}>
          Clearing a date leaves the task on the board under its family. It stops
          asking; it does not go away.
        </div>
      )}
    </>
  );
}
