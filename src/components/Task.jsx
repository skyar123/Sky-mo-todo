import React, { useState } from "react";
import { S, HOT, WARN } from "../styles.js";
import { LANES, KIND, ORDER } from "../data/library.js";
import { dueInfo } from "../lib/dates.js";
import { buildICS, downloadICS, icsFilename } from "../lib/ics.js";

export function pillStyle(d) {
  if (!d) return null;
  if (d.hot) return { background: HOT, color: "#fff" };
  if (d.soon) return { background: WARN, color: "#3A2E12" };
  return { background: "#EFEBF6", color: "#3A2E12" };
}

/* Tapping a task opens it already editable. There is no separate edit mode and
   no save button: every field writes straight through, and the board's
   debounced save picks it up. Getting a due date onto a task should cost one
   tap and one date, not a trip through a dialog. */
export function Task({ x, color, today, families, familyById, board, onFlash }) {
  const [open, setOpen] = useState(false);
  const d = dueInfo(x.due, today);
  const set = (patch) => board.update(x.id, patch);

  function remind() {
    if (!x.due) {
      onFlash?.("Give it a due date first");
      return;
    }
    const ics = buildICS([x], familyById);
    if (!ics) {
      onFlash?.("Could not build that reminder");
      return;
    }
    downloadICS(ics, icsFilename(x.text.slice(0, 24), today));
    onFlash?.("Opening in your calendar");
  }

  return (
    <div style={{ ...S.task, opacity: x.done ? 0.45 : 1 }}>
      <div style={S.taskTop}>
        <button
          onClick={() => board.toggle(x.id)}
          style={{ ...S.box, borderColor: color, background: x.done ? color : "transparent" }}
          role="checkbox"
          aria-checked={x.done}
          aria-label={x.done ? `Mark not done: ${x.text}` : `Mark done: ${x.text}`}
        >
          <span aria-hidden="true">{x.done ? "✓" : ""}</span>
        </button>
        <button
          onClick={() => setOpen(!open)}
          style={{ ...S.taskText, textDecoration: x.done ? "line-through" : "none" }}
          aria-expanded={open}
        >
          {x.text}
        </button>
        {d && <span style={{ ...S.pill, ...pillStyle(d) }}>{d.label}</span>}
      </div>

      {open && (
        <div style={S.taskBody}>
          <div style={S.editLabel}>Task</div>
          <input
            value={x.text}
            onChange={(e) => set({ text: e.target.value })}
            style={S.editInput}
            aria-label="Task text"
            data-noswipe
          />

          <div style={S.editLabel}>Due</div>
          <div style={S.editRow}>
            <input
              type="date"
              value={x.due || ""}
              onChange={(e) => set({ due: e.target.value || null })}
              style={{ ...S.editInput, flex: 1 }}
              aria-label="Due date"
              data-noswipe
            />
            {x.due && (
              <button onClick={() => set({ due: null })} style={S.mini} aria-label="Clear due date">
                clear
              </button>
            )}
          </div>

          <div style={S.editLabel}>Note</div>
          <textarea
            value={x.note || ""}
            onChange={(e) => set({ note: e.target.value })}
            rows={2}
            style={S.editArea}
            placeholder="Anything you want with it"
            aria-label="Note"
            data-noswipe
          />

          <div style={S.editLabel}>Family and kind</div>
          <div style={{ ...S.editRow, marginBottom: 4 }}>
            <select
              value={x.client || ""}
              onChange={(e) => set({ client: e.target.value || null })}
              style={S.select}
              aria-label="Family"
              data-noswipe
            >
              <option value="">Across the caseload</option>
              {families.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select
              value={x.kind}
              onChange={(e) => set({ kind: e.target.value })}
              style={S.select}
              aria-label="Kind"
              data-noswipe
            >
              {ORDER.map((k) => <option key={k} value={k}>{KIND[k]}</option>)}
            </select>
          </div>

          <div style={S.editLabel}>Whose</div>
          <div style={S.rowWrap}>
            {LANES.map(([k, l]) => (
              <button
                key={k}
                onClick={() => set({ lane: k })}
                style={{ ...S.mini, ...(x.lane === k ? S.miniOn : {}) }}
                aria-pressed={x.lane === k}
              >
                {l}
              </button>
            ))}
          </div>

          <div style={S.rowWrap}>
            <button onClick={remind} style={S.mini}>Remind me</button>
            <button onClick={() => setOpen(false)} style={S.mini}>Done editing</button>
            {!x.seed && (
              <button onClick={() => board.removeWithUndo(x.id)} style={{ ...S.mini, marginLeft: "auto" }}>
                delete
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* One line, one tap. Adding a task to the family in front of you should not
   mean opening the paste sheet and picking the family again. */
export function QuickAdd({ client, board, onFlash }) {
  const [text, setText] = useState("");

  function submit(e) {
    e.preventDefault();
    const t = text.trim();
    if (t.length < 2) return;
    board.addQuick({ text: t, client });
    setText("");
    onFlash?.("Added");
  }

  return (
    <form style={S.quickAdd} onSubmit={submit}>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Add something…"
        style={{ ...S.editInput, flex: 1 }}
        aria-label="Add a task to this family"
        data-noswipe
      />
      <button type="submit" style={{ ...S.mini, ...(text.trim() ? S.miniOn : {}) }}>Add</button>
    </form>
  );
}
