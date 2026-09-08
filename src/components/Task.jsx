import React, { useState } from "react";
import { S, HOT, WARN } from "../styles.js";
import { LANES } from "../data/library.js";
import { dueInfo } from "../lib/dates.js";

export function pillStyle(d) {
  if (!d) return null;
  if (d.hot) return { background: HOT, color: "#fff" };
  if (d.soon) return { background: WARN, color: "#3A2E12" };
  return { background: "#EFEBF6", color: "#3A2E12" };
}

export function Task({ x, color, today, toggle, setLaneOf, remove }) {
  const [open, setOpen] = useState(false);
  const d = dueInfo(x.due, today);
  return (
    <div style={{ ...S.task, opacity: x.done ? 0.45 : 1 }}>
      <div style={S.taskTop}>
        <button
          onClick={() => toggle(x.id)}
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
          {x.note && <div style={S.note}>{x.note}</div>}
          <div style={S.rowWrap}>
            {LANES.map(([k, l]) => (
              <button
                key={k}
                onClick={() => setLaneOf(x.id, k)}
                style={{ ...S.mini, ...(x.lane === k ? S.miniOn : {}) }}
                aria-pressed={x.lane === k}
              >
                {l}
              </button>
            ))}
            {!x.seed && (
              <button onClick={() => remove(x.id)} style={{ ...S.mini, marginLeft: "auto" }}>
                delete
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
