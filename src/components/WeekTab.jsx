import React, { useMemo } from "react";
import { S, LINE } from "../styles.js";
import { spokenDate, addDays, startOfDay } from "../lib/dates.js";
import { nameOf } from "../lib/identity.js";

/* The week, looking backwards.

   A caseload board is all forward pressure: what is left, what is due, what is
   coming. None of that tells you what a week actually held, and on a Friday
   that is the thing worth seeing. It is also what the weekly routine reads, so
   that what got done is on the record rather than only in the app. */

const startOfWeek = (today) => addDays(startOfDay(today), -((today.getDay() + 6) % 7));

/** Everything ticked since the start of this week, newest first. */
export function doneThisWeek(tasks, today) {
  const from = startOfWeek(today).getTime();
  return tasks
    .filter((t) => t.done && (t.updatedAt || 0) >= from)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export function WeekTab({ tasks, families, today, onOpenFamily }) {
  const from = startOfWeek(today);
  const done = useMemo(() => doneThisWeek(tasks, today), [tasks, today]);
  const openLeft = tasks.filter((t) => !t.done).length;

  const groups = useMemo(() => {
    const byFamily = new Map();
    const loose = [];
    for (const t of done) {
      if (!t.client) { loose.push(t); continue; }
      if (!byFamily.has(t.client)) byFamily.set(t.client, []);
      byFamily.get(t.client).push(t);
    }
    const out = families.filter((f) => byFamily.has(f.id)).map((f) => ({ family: f, rows: byFamily.get(f.id) }));
    if (loose.length) out.push({ family: null, rows: loose });
    return out;
  }, [done, families]);

  const agenda = done.filter((t) => t.agenda).length;
  const flagged = done.filter((t) => t.urgent).length;

  return (
    <>
      <div style={S.h1}>This week</div>
      <div style={S.sub}>
        Since {spokenDate(from)}. {done.length} done, {openLeft} still open.
      </div>

      {done.length === 0 && (
        <div style={S.empty}>
          Nothing ticked off yet this week. What you finish shows up here, and goes
          into the weekly record on Saturday.
        </div>
      )}

      {done.length > 0 && (
        <div style={S.rules}>
          <div style={S.rule}>{done.length} finished across {groups.filter((g) => g.family).length} families</div>
          {agenda > 0 && <div style={S.rule}>{agenda} of them were for the clinician</div>}
          {flagged > 0 && <div style={S.rule}>{flagged} were safety-flagged</div>}
        </div>
      )}

      {groups.map(({ family, rows }) => (
        <div key={family ? family.id : "loose"} style={{ marginBottom: 6 }}>
          <button
            onClick={() => family && onOpenFamily(family.id)}
            style={{
              display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left",
              background: "transparent", border: "none", padding: "16px 2px 6px",
              fontFamily: "inherit", color: "inherit", cursor: family ? "pointer" : "default",
            }}
            className="tap"
          >
            {family && <span style={{ ...S.dot, background: family.color }} aria-hidden="true" />}
            <span style={{ fontSize: 14.5, fontWeight: 700 }}>
              {family ? family.name : "Not tied to a family"}
            </span>
            <span style={{ fontSize: 12, opacity: 0.45 }}>{rows.length}</span>
          </button>

          {rows.map((t) => (
            <div
              key={t.id}
              style={{
                display: "flex", gap: 10, alignItems: "flex-start",
                padding: "9px 2px", borderBottom: `1px solid ${LINE}`,
              }}
            >
              <span aria-hidden="true" style={{ fontSize: 13, opacity: 0.5, marginTop: 1 }}>✓</span>
              <span style={{ flex: 1, fontSize: 13.5, lineHeight: 1.45, opacity: 0.8 }}>
                {t.text}
                {t.by && t.by !== "unknown" && (
                  <span style={{ display: "block", fontSize: 11.5, opacity: 0.55, marginTop: 2 }}>
                    {nameOf(t.by)}
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      ))}

      <div style={{ ...S.tip, marginTop: 18 }}>
        The Saturday sweep writes this list to your Drive before it brings in the
        new week, so there is a record of what got done and not only of what is left.
      </div>
    </>
  );
}
