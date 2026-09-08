import React from "react";
import { S } from "../styles.js";
import { VisitRow } from "./bits.jsx";
import { pillStyle } from "./Task.jsx";
import { LONG, fmtDay, dueInfo, spokenDate } from "../lib/dates.js";
import { agendaFor, nextVisitDay } from "../lib/schedule.js";
import { buildICS, downloadICS, icsFilename } from "../lib/ics.js";

export function DayTab({ caseload, today, counts, supplies, soon, openCount, unsent, reminderDay, familyById, onFlash, onOpenFamily, onGoTexts }) {
  const { families, blocks } = caseload;
  const agenda = agendaFor(families, blocks, today);
  const ahead = agenda.length ? null : nextVisitDay(families, today);

  /* Due dates are only useful if they reach you when you are not looking at
     this screen, so they go into the calendar that already nags you. */
  function remindAll() {
    const ics = buildICS(soon.map((s) => s.task), familyById);
    if (!ics) {
      onFlash?.("Nothing with a due date this week");
      return;
    }
    downloadICS(ics, icsFilename("due-this-week", today));
    onFlash?.("Opening in your calendar");
  }
  const aheadAgenda = ahead ? agendaFor(families, blocks, ahead) : [];

  return (
    <>
      <div style={S.h1}>{LONG[today.getDay()]}</div>
      <div style={S.sub}>
        {fmtDay(today)} · {openCount} open · swipe to change tabs
      </div>

      {agenda.map((item, i) =>
        item.kind === "visit" ? (
          <VisitRow
            key={item.c.id}
            c={item.c}
            count={counts[item.c.id]?.open || 0}
            overdue={counts[item.c.id]?.overdue || 0}
            supplies={supplies[item.c.id]}
            onClick={() => onOpenFamily(item.c.id)}
          />
        ) : (
          <div key={`b${i}`} style={S.blockRow}>
            <span style={S.blockTime}>{item.time}</span>
            <span>{item.label}</span>
          </div>
        )
      )}

      {agenda.length === 0 && (
        <>
          <div style={S.empty}>No visits today.</div>
          {ahead && (
            <>
              <div style={S.h2}>Next up · {spokenDate(ahead)}</div>
              {aheadAgenda.map((item, i) =>
                item.kind === "visit" ? (
                  <VisitRow
                    key={item.c.id}
                    c={item.c}
                    count={counts[item.c.id]?.open || 0}
                    overdue={counts[item.c.id]?.overdue || 0}
                    supplies={supplies[item.c.id]}
                    onClick={() => onOpenFamily(item.c.id)}
                  />
                ) : (
                  <div key={`ab${i}`} style={S.blockRow}>
                    <span style={S.blockTime}>{item.time}</span>
                    <span>{item.label}</span>
                  </div>
                )
              )}
            </>
          )}
        </>
      )}

      {unsent.length > 0 && reminderDay && (
        <button onClick={onGoTexts} style={S.nudge}>
          <div style={S.nudgeTitle}>Send reminders for {spokenDate(reminderDay)}</div>
          <div style={S.nudgeSub}>{unsent.map((c) => `${c.name} at ${c.time}`).join(", ")}</div>
        </button>
      )}

      {soon.length > 0 && (
        <>
          <div style={S.h2}>Due this week</div>
          {soon.map(({ task, family }) => {
            const d = dueInfo(task.due, today);
            return (
              <button key={task.id} onClick={() => onOpenFamily(family ? family.id : null, task)} style={S.dueRow}>
                <span
                  style={{ ...S.dot, width: 10, height: 10, marginTop: 5, background: family ? family.color : "#B9AECE" }}
                  aria-hidden="true"
                />
                <span style={S.dueText}>
                  {family && <span style={{ fontWeight: 700 }}>{family.name} · </span>}
                  {task.text}
                </span>
                <span style={{ ...S.pill, ...pillStyle(d) }}>{d.label}</span>
              </button>
            );
          })}
          <div style={{ ...S.rowWrap, marginTop: 12 }}>
            <button onClick={remindAll} style={S.mini}>
              Add these {soon.length} to my calendar
            </button>
          </div>
        </>
      )}
    </>
  );
}
