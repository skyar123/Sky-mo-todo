import React, { useState } from "react";
import { S, LINE } from "../styles.js";
import { doneAt } from "../lib/useSettle.js";

/* The Done list at the bottom of a list: where a ticked row goes, so it can
   be seen to have gone somewhere, and brought back with one tap.

   The newest few are shown; the rest wait behind a line, so a family with
   months of ticked work does not grow a wall of struck-through text. */

const SHOWN = 5;

export function Archive({ title = "Done", rows, render, settle, emptyHidden = true }) {
  const [all, setAll] = useState(false);
  if (!rows.length && emptyHidden) return null;
  const sorted = rows.slice().sort((a, b) => doneAt(b) - doneAt(a));
  const shown = all ? sorted : sorted.slice(0, SHOWN);
  return (
    <div data-archive style={{ marginTop: 14, paddingTop: 4, borderTop: `1px dashed ${LINE}` }}>
      <div style={{ ...S.dayLabel, marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
        <span aria-hidden="true" style={{ color: "#2E8B57", opacity: 1 }}>✓</span>
        {title} · {rows.length}
      </div>
      {shown.map((t) => (
        <div
          key={t.id}
          data-archived={t.id}
          ref={settle?.arrive(t.id)}
          className={settle?.isArriving(t.id) ? "skmo-arrived" : undefined}
        >
          {render(t)}
        </div>
      ))}
      {sorted.length > SHOWN && (
        <button onClick={() => setAll(!all)} style={{ ...S.textBtn, marginTop: 4 }}>
          {all ? "Show fewer" : `Show ${sorted.length - SHOWN} more`}
        </button>
      )}
    </div>
  );
}
