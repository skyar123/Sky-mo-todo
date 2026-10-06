import React, { useState } from "react";
import { S, LINE, HOT } from "../styles.js";
import { dueInfo, fmtShort, parseISO } from "../lib/dates.js";
import { pillStyle, DONE_PILL } from "./Task.jsx";
import { Archive } from "./Archive.jsx";
import { useSettle } from "../lib/useSettle.js";

/* Paperwork rows, on the day screen and on each family.

   One tap ticks a step off. The step's date comes from the family's
   admission date, so there is nothing to reschedule here: a SNIFF that is
   late is late, and the only useful answers are "done" or "tell me why it is
   due", which is what tapping the line shows. A ticked step fades and goes
   to the Done list under it, where a tap brings it back. */

function pill(t, today) {
  if (t.done) return { label: "done", style: DONE_PILL };
  const d = dueInfo(t.due, today);
  if (d && d.days > 14 && t.starts && parseISO(t.starts) <= today) return { label: "open now", style: { background: "#EFEBF6" } };
  return d ? { label: d.label, style: d.hot ? { background: HOT, color: "#fff", borderColor: HOT } : pillStyle(d) } : null;
}

export function PaperRow({ t, family, today, onTick, leaving, showFamily = true }) {
  const [open, setOpen] = useState(false);
  const p = pill(t, today);
  const color = family ? family.color : "#B9AECE";
  return (
    <div data-paper={t.id} data-row={t.id} style={{ borderBottom: `1px solid ${LINE}` }} className={leaving ? "skmo-leaving" : undefined}>
      <div style={{ ...S.taskTop, paddingBottom: 10, opacity: t.done && !leaving ? 0.6 : 1 }} className="handed">
        <button
          onClick={() => onTick(t)}
          style={{ ...S.box, borderColor: color, background: t.done ? color : "transparent" }}
          role="checkbox"
          aria-checked={!!t.done}
          aria-label={`${t.done ? "Mark not done" : "Mark done"}: ${family ? family.name + ", " : ""}${t.text}`}
        >
          <span aria-hidden="true" className={t.done ? "skmo-check" : undefined}>{t.done ? "✓" : ""}</span>
        </button>
        <button
          onClick={() => setOpen(!open)}
          style={{ ...S.taskText, fontSize: 13.5, lineHeight: 1.45, textDecoration: t.done ? "line-through" : "none" }}
          aria-expanded={open}
        >
          {showFamily && family && <span style={{ fontWeight: 700 }}>{family.name} · </span>}
          {t.text}
          {open && t.note && (
            <span style={{ display: "block", fontSize: 12, opacity: 0.65, marginTop: 4, lineHeight: 1.5, textDecoration: "none" }}>
              Due {fmtShort(parseISO(t.due))}. {t.note}
            </span>
          )}
        </button>
        {p && <span style={{ ...S.pill, ...p.style }}>{p.label}</span>}
      </div>
    </div>
  );
}

/** What a tap on a paperwork box does, with the motion and a way back. */
export function usePaperTick(board, onFlash) {
  const settle = useSettle();
  const onTick = (t) => {
    if (t.done) {
      board.toggle(t.id);
      onFlash?.("Back on the list");
      return;
    }
    settle.settle(t.id, () => board.toggle(t.id));
    onFlash?.("Done", { label: "Undo", run: () => board.toggle(t.id) });
  };
  return { settle, onTick };
}

/**
 * The top of the day: the paperwork that is late or close. Yours first (the
 * SNIFFs and home observations), then what you share with the clinician, and
 * under it what was ticked off lately.
 */
export function PaperworkBlock({ items, recent = [], familyById, today, board, onFlash }) {
  const { settle, onTick } = usePaperTick(board, onFlash);
  /* A step ticked a moment ago stays in its place until it has faded. */
  const rows = [...items, ...recent.filter((t) => settle.isLeaving(t.id))].sort((a, b) => a.due.localeCompare(b.due));
  const archived = recent.filter((t) => !settle.isLeaving(t.id));
  if (!rows.length && !archived.length) return null;
  const late = items.filter((t) => (dueInfo(t.due, today)?.days ?? 0) < 0).length;
  const mine = rows.filter((t) => t.lane === "sky");
  const shared = rows.filter((t) => t.lane !== "sky");
  const row = (t) => (
    <PaperRow key={t.id} t={t} family={familyById.get(t.client)} today={today} onTick={onTick} leaving={settle.isLeaving(t.id)} />
  );
  return (
    <div data-paperwork style={{ marginBottom: 8 }}>
      <div style={{ ...S.h2, marginTop: 0 }}>
        Paperwork{late ? ` · ${late} late` : items.length ? "" : " · all caught up"}
      </div>
      {/* What the last fortnight's ticks have done to the pile, so finishing
          a SNIFF shows as progress and not only as one line fewer. */}
      {archived.length > 0 && (
        <div data-meter style={{ margin: "-4px 0 8px" }}>
          <div style={{ height: 6, borderRadius: 3, background: "#EFEBF6", overflow: "hidden" }}>
            <div
              className="skmo-meter"
              style={{ height: "100%", borderRadius: 3, background: "#2E8B57", width: `${Math.round((100 * archived.length) / (archived.length + items.length))}%` }}
            />
          </div>
          <div style={{ fontSize: 11.5, opacity: 0.6, marginTop: 4 }}>
            {archived.length} done in the last two weeks{items.length ? `, ${items.length} to go` : ""}
          </div>
        </div>
      )}
      {mine.length > 0 && (
        <>
          <div style={S.dayLabel}>Yours</div>
          {mine.map(row)}
        </>
      )}
      {shared.length > 0 && (
        <>
          <div style={S.dayLabel}>With the clinician</div>
          {shared.map(row)}
        </>
      )}
      <Archive title="Done lately" rows={archived} settle={settle} render={row} />
      {items.length > 0 && (
        <div style={{ ...S.tip, marginTop: 6 }}>
          Dated from each family's admission. Tap a line for what it covers.
        </div>
      )}
    </div>
  );
}
