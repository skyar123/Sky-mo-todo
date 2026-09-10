import React from "react";
import { S } from "../styles.js";
import { VisitRow } from "./bits.jsx";
import { pillStyle } from "./Task.jsx";
import { LONG, fmtDay, dueInfo, spokenDate } from "../lib/dates.js";
import { agendaFor, nextVisitDay } from "../lib/schedule.js";
import { buildICS, downloadICS, icsFilename } from "../lib/ics.js";
import { handoffMessage } from "../lib/handoff.js";

/* A standing meeting is just a line on the day, except teaming, which is the
   one you arrive at with a list. That one opens. */
function BlockRow({ item, teaming, agendaCount, onOpenTeaming }) {
  if (!teaming) {
    return (
      <div style={S.blockRow}>
        <span style={S.blockTime}>{item.time}</span>
        <span>{item.label}</span>
      </div>
    );
  }
  return (
    <button onClick={onOpenTeaming} style={{ ...S.visit, opacity: 1 }}>
      <span style={S.visitTime}>{item.time}</span>
      <span style={{ ...S.dot, background: "#5C6BD8" }} aria-hidden="true" />
      <span style={{ flex: 1 }}>
        <span style={{ ...S.visitName, fontSize: 15 }}>{item.label}</span>
        <span style={S.supLine}>
          {agendaCount > 0 ? `${agendaCount} to bring up` : "nothing on the list yet"}
        </span>
      </span>
      {agendaCount > 0 && <span style={S.visitCount}>{agendaCount}</span>}
    </button>
  );
}

export function DayTab({ caseload, today, counts, supplies, soon, openCount, unsent, reminderDay, familyById, changedFamilies, theirChanges, theirName, agendaCount, isTeamingBlock, onCatchUp, onOpenTeaming, onFlash, onOpenFamily, onGoTexts }) {
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
    onFlash?.(handoffMessage(downloadICS(ics, icsFilename("due-this-week", today))));
  }
  const aheadAgenda = ahead ? agendaFor(families, blocks, ahead) : [];

  return (
    <>
      <div style={S.h1}>{LONG[today.getDay()]}</div>
      <div style={S.sub}>
        {fmtDay(today)} · {openCount} open · swipe to change tabs
      </div>

      {theirChanges.length > 0 && (
        <button onClick={onCatchUp} style={{ ...S.nudge, marginTop: 0, marginBottom: 18, background: "#F2F1FB", borderColor: "#CFCAEB" }}>
          <div style={S.nudgeTitle}>
            {theirChanges.length} {theirChanges.length === 1 ? "change" : "changes"} from {theirName}
          </div>
          <div style={S.nudgeSub}>
            {theirChanges.slice(0, 3).map((t) => {
              const f = t.client ? familyById.get(t.client) : null;
              /* A tick and an edit read very differently, so say which. */
              return `${t.done ? "✓ " : ""}${f ? f.name + " · " : ""}${t.text}`;
            }).join(" — ")}
            {theirChanges.length > 3 ? ` — and ${theirChanges.length - 3} more` : ""}
          </div>
          <div style={{ ...S.nudgeSub, marginTop: 6, opacity: 0.5 }}>Tap to mark as seen</div>
        </button>
      )}

      {agenda.map((item, i) =>
        item.kind === "visit" ? (
          <VisitRow
            key={item.c.id}
            c={item.c}
            count={counts[item.c.id]?.open || 0}
            overdue={counts[item.c.id]?.overdue || 0}
            supplies={supplies[item.c.id]}
            changed={changedFamilies.has(item.c.id)}
            onClick={() => onOpenFamily(item.c.id)}
          />
        ) : (
          <BlockRow
            key={`b${i}`}
            item={item}
            teaming={isTeamingBlock(item)}
            agendaCount={agendaCount}
            onOpenTeaming={onOpenTeaming}
          />
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
                    changed={changedFamilies.has(item.c.id)}
                    onClick={() => onOpenFamily(item.c.id)}
                  />
                ) : (
                  <BlockRow
                    key={`ab${i}`}
                    item={item}
                    teaming={isTeamingBlock(item)}
                    agendaCount={agendaCount}
                    onOpenTeaming={onOpenTeaming}
                  />
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
