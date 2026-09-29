import React, { useState } from "react";
import { S, LINE, HOT } from "../styles.js";
import { dueInfo, fmtShort, parseISO } from "../lib/dates.js";
import { pillStyle } from "./Task.jsx";

/* Paperwork rows, on the day screen and on each family.

   One tap ticks a step off. The step's date comes from the family's
   admission date, so there is nothing to reschedule here: a SNIFF that is
   late is late, and the only useful answers are "done" or "tell me why it is
   due", which is what tapping the line shows. */

function pill(t, today) {
  const d = dueInfo(t.due, today);
  if (d && d.days > 14 && t.starts && parseISO(t.starts) <= today) return { label: "open now", style: { background: "#EFEBF6" } };
  return d ? { label: d.label, style: d.hot ? { background: HOT, color: "#fff", borderColor: HOT } : pillStyle(d) } : null;
}

export function PaperRow({ t, family, today, board, onFlash, showFamily = true }) {
  const [open, setOpen] = useState(false);
  const p = pill(t, today);
  return (
    <div data-paper={t.id} style={{ borderBottom: `1px solid ${LINE}` }}>
      <div style={{ ...S.taskTop, paddingBottom: 10 }} className="handed">
        <button
          onClick={() => {
            board.toggle(t.id);
            onFlash?.(t.done ? "Back on the list" : "Done", t.done ? undefined : { label: "Undo", run: () => board.toggle(t.id) });
          }}
          style={{ ...S.box, borderColor: family ? family.color : "#B9AECE", background: t.done ? (family?.color || "#B9AECE") : "transparent" }}
          role="checkbox"
          aria-checked={!!t.done}
          aria-label={`${t.done ? "Mark not done" : "Mark done"}: ${family ? family.name + ", " : ""}${t.text}`}
        >
          <span aria-hidden="true">{t.done ? "✓" : ""}</span>
        </button>
        <button onClick={() => setOpen(!open)} style={{ ...S.taskText, fontSize: 13.5, lineHeight: 1.45 }} aria-expanded={open}>
          {showFamily && family && <span style={{ fontWeight: 700 }}>{family.name} · </span>}
          {t.text}
          {open && t.note && (
            <span style={{ display: "block", fontSize: 12, opacity: 0.65, marginTop: 4, lineHeight: 1.5 }}>
              Due {fmtShort(parseISO(t.due))}. {t.note}
            </span>
          )}
        </button>
        {p && <span style={{ ...S.pill, ...p.style }}>{p.label}</span>}
      </div>
    </div>
  );
}

/**
 * The top of the day: the paperwork that is late or close. Yours first (the
 * SNIFFs and home observations), then what you share with the clinician.
 */
export function PaperworkBlock({ items, familyById, today, board, onFlash }) {
  if (!items.length) return null;
  const late = items.filter((t) => (dueInfo(t.due, today)?.days ?? 0) < 0).length;
  const mine = items.filter((t) => t.lane === "sky");
  const shared = items.filter((t) => t.lane !== "sky");
  const group = (rows) =>
    rows.map((t) => (
      <PaperRow key={t.id} t={t} family={familyById.get(t.client)} today={today} board={board} onFlash={onFlash} />
    ));
  return (
    <div data-paperwork style={{ marginBottom: 8 }}>
      <div style={{ ...S.h2, marginTop: 0 }}>
        Paperwork{late ? ` · ${late} late` : ""}
      </div>
      {mine.length > 0 && (
        <>
          <div style={S.dayLabel}>Yours</div>
          {group(mine)}
        </>
      )}
      {shared.length > 0 && (
        <>
          <div style={S.dayLabel}>With the clinician</div>
          {group(shared)}
        </>
      )}
      <div style={{ ...S.tip, marginTop: 6 }}>
        Dated from each family's admission. Tap a line for what it covers.
      </div>
    </div>
  );
}
