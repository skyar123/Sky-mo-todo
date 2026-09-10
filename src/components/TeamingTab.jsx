import React, { useMemo, useState } from "react";
import { S, LINE } from "../styles.js";
import { spokenDate, addDays, dueInfo } from "../lib/dates.js";
import { nameOf } from "../lib/identity.js";
import { pillStyle } from "./Task.jsx";

/** The next time this standing meeting comes round, today included. */
function nextOccurrence(block, today) {
  if (!block) return null;
  return addDays(today, (block.day - today.getDay() + 7) % 7);
}

/**
 * What to bring up on Thursday.
 *
 * Things worth raising with Mo surface all week and are forgotten by the time
 * the meeting starts. Anything can be flagged for teaming as it comes up, and
 * a note's "bring to the clinical partner" items land here on their own. Both
 * of them add to the same list, so it is ready before either sits down.
 */
export function TeamingTab({ block, families, familyById, tasks, today, board, onOpenFamily, onFlash }) {
  const [text, setText] = useState("");

  const when = nextOccurrence(block, today);
  const isToday = when && when.getDay() === today.getDay();

  const items = useMemo(() => tasks.filter((t) => t.agenda), [tasks]);
  const open = items.filter((t) => !t.done);
  const done = items.filter((t) => t.done);

  /* Grouped by family, with the unattached ones last: the meeting tends to
     move family by family. */
  const groups = useMemo(() => {
    const byFamily = new Map();
    const loose = [];
    for (const t of open) {
      if (!t.client) { loose.push(t); continue; }
      if (!byFamily.has(t.client)) byFamily.set(t.client, []);
      byFamily.get(t.client).push(t);
    }
    const ordered = families.filter((f) => byFamily.has(f.id)).map((f) => ({ family: f, rows: byFamily.get(f.id) }));
    if (loose.length) ordered.push({ family: null, rows: loose });
    return ordered;
  }, [open, families]);

  function add(e) {
    e.preventDefault();
    const t = text.trim();
    if (t.length < 2) return;
    board.addQuick({ text: t, client: null, lane: "both", kind: "admin", agenda: true });
    setText("");
    onFlash?.("Added to Thursday");
  }

  return (
    <>
      <div style={S.h1}>{block?.label?.split(",")[0] || "Teaming"}</div>
      <div style={S.sub}>
        {when
          ? isToday
            ? `Today at ${block.time}. ${open.length} to bring up.`
            : `${spokenDate(when)} at ${block.time}. ${open.length} to bring up.`
          : "No standing teaming slot on the calendar."}
      </div>

      <form style={S.quickAdd} onSubmit={add}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What do you want to bring up?"
          style={{ ...S.editInput, flex: 1 }}
          aria-label="Add something to bring up at teaming"
          data-noswipe
        />
        <button type="submit" style={{ ...S.mini, ...(text.trim() ? S.miniOn : {}) }}>Add</button>
      </form>
      <div style={{ ...S.tip, marginTop: 0, marginBottom: 18 }}>
        Anything either of you flags for teaming lands here, and items a visit note
        marks for the clinician arrive on their own.
      </div>

      {open.length === 0 && (
        <div style={S.empty}>
          Nothing on the list yet. Add it above, or open a task and tap “Bring to teaming”.
        </div>
      )}

      {groups.map(({ family, rows }) => (
        <div key={family ? family.id : "loose"} style={{ marginBottom: 6 }}>
          <button
            onClick={() => family && onOpenFamily(family.id)}
            style={{
              display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left",
              background: "transparent", border: "none", padding: "14px 2px 6px",
              fontFamily: "inherit", color: "inherit", cursor: family ? "pointer" : "default",
            }}
          >
            {family && <span style={{ ...S.dot, background: family.color }} aria-hidden="true" />}
            <span style={{ fontSize: 14.5, fontWeight: 700 }}>
              {family ? family.name : "Across the caseload"}
            </span>
            <span style={{ fontSize: 12, opacity: 0.45 }}>{rows.length}</span>
          </button>

          {rows.map((t) => {
            const d = dueInfo(t.due, today);
            return (
              <div key={t.id} style={{ ...S.taskTop, borderBottom: `1px solid ${LINE}`, paddingBottom: 10 }}>
                <button
                  onClick={() => board.toggle(t.id)}
                  style={{ ...S.box, borderColor: family ? family.color : "#B9AECE" }}
                  role="checkbox"
                  aria-checked={false}
                  aria-label={`Mark discussed: ${t.text}`}
                />
                <span style={{ flex: 1, fontSize: 13.5, lineHeight: 1.45 }}>
                  {t.text}
                  {(t.note || t.by) && (
                    <span style={{ display: "block", fontSize: 11.5, opacity: 0.55, marginTop: 3, lineHeight: 1.45 }}>
                      {t.by && t.by !== "unknown" ? `${nameOf(t.by)} added this` : ""}
                      {t.by && t.by !== "unknown" && t.note ? " · " : ""}
                      {t.note ? t.note.slice(0, 90) + (t.note.length > 90 ? "…" : "") : ""}
                    </span>
                  )}
                </span>
                {d && <span style={{ ...S.pill, ...pillStyle(d) }}>{d.label}</span>}
                <button
                  onClick={() => board.update(t.id, { agenda: false })}
                  style={{ ...S.mini, padding: "4px 9px", fontSize: 11 }}
                  aria-label={`Take off the teaming list: ${t.text}`}
                >
                  off
                </button>
              </div>
            );
          })}
        </div>
      ))}

      {done.length > 0 && (
        <>
          <div style={S.h2}>Talked about ({done.length})</div>
          {done.map((t) => {
            const f = t.client ? familyById.get(t.client) : null;
            return (
              <button
                key={t.id}
                onClick={() => board.toggle(t.id)}
                style={{ ...S.dueRow, opacity: 0.5 }}
              >
                <span style={{ ...S.dot, width: 10, height: 10, marginTop: 5, background: f ? f.color : "#B9AECE" }} aria-hidden="true" />
                <span style={{ ...S.dueText, textDecoration: "line-through" }}>
                  {f && <span style={{ fontWeight: 700 }}>{f.name} · </span>}
                  {t.text}
                </span>
              </button>
            );
          })}
          <div style={{ ...S.tip, marginTop: 10 }}>
            Tap one to put it back if it needs another round.
          </div>
        </>
      )}
    </>
  );
}

export { nextOccurrence };
