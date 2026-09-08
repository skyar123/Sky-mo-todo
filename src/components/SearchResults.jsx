import React from "react";
import { S } from "../styles.js";
import { VisitRow } from "./bits.jsx";
import { pillStyle } from "./Task.jsx";
import { dueInfo } from "../lib/dates.js";

/* Matches on everything a person might actually remember: the pseudonym,
   the child's name, a caseworker's name in the alias list, the wording of a
   task, or a phrase buried in its note. */
export function searchCaseload(families, tasks, raw) {
  const q = raw.trim().toLowerCase();
  if (q.length < 2) return null;

  const famHit = (c) =>
    [c.name, c.child, c.place, c.clinician, c.caregiver, c.childNote, c.bring, ...(c.alias || []), ...(c.watch || []), ...(c.goals || [])]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q));

  const matchedFamilies = families.filter(famHit);
  const byId = new Map(families.map((c) => [c.id, c]));
  const matchedTasks = tasks
    .filter((t) => `${t.text} ${t.note}`.toLowerCase().includes(q))
    .map((t) => ({ task: t, family: t.client ? byId.get(t.client) : null }));

  return { q: raw.trim(), matchedFamilies, matchedTasks };
}

export function SearchResults({ result, today, counts, supplies, onOpenFamily, onToggle }) {
  const { matchedFamilies, matchedTasks, q } = result;
  const total = matchedFamilies.length + matchedTasks.length;

  return (
    <>
      <div style={S.h1}>Search</div>
      <div style={S.sub}>
        {total === 0 ? `Nothing matches “${q}”.` : `${total} match${total === 1 ? "" : "es"} for “${q}”.`}
      </div>

      {matchedFamilies.length > 0 && (
        <>
          <div style={S.h2}>Families</div>
          {matchedFamilies.map((c) => (
            <VisitRow
              key={c.id}
              c={c}
              count={counts[c.id]?.open || 0}
              overdue={counts[c.id]?.overdue || 0}
              supplies={supplies[c.id]}
              onClick={() => onOpenFamily(c.id)}
            />
          ))}
        </>
      )}

      {matchedTasks.length > 0 && (
        <>
          <div style={S.h2}>Tasks</div>
          {matchedTasks.map(({ task, family }) => {
            const d = dueInfo(task.due, today);
            return (
              <div key={task.id} style={S.dueRow}>
                <button
                  onClick={() => onToggle(task.id)}
                  style={{
                    ...S.box,
                    marginTop: 0,
                    borderColor: family ? family.color : "#B9AECE",
                    background: task.done ? (family ? family.color : "#B9AECE") : "transparent",
                  }}
                  role="checkbox"
                  aria-checked={task.done}
                  aria-label={`Mark ${task.done ? "not done" : "done"}: ${task.text}`}
                >
                  <span aria-hidden="true">{task.done ? "✓" : ""}</span>
                </button>
                <button
                  onClick={() => family && onOpenFamily(family.id)}
                  style={{ ...S.taskText, textDecoration: task.done ? "line-through" : "none" }}
                >
                  {family && <span style={{ fontWeight: 700 }}>{family.name} · </span>}
                  {task.text}
                </button>
                {d && <span style={{ ...S.pill, ...pillStyle(d) }}>{d.label}</span>}
              </div>
            );
          })}
        </>
      )}
    </>
  );
}
