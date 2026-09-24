import React from "react";
import { S } from "../styles.js";
import { VisitRow } from "./bits.jsx";
import { pillStyle } from "./Task.jsx";
import { LONG, fmtDay, dueInfo, spokenDate, addDays } from "../lib/dates.js";
import { agendaFor, liveAgendaFor } from "../lib/schedule.js";
import { buildICS, downloadICS, icsFilename } from "../lib/ics.js";
import { handoffMessage } from "../lib/handoff.js";

/* "12 minutes ago" is more use than a timestamp when the question is really
   "is this current?". */
function asOf(at) {
  const mins = Math.round((Date.now() - at) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

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
    <button onClick={onOpenTeaming} style={{ ...S.visit, opacity: 1 }} aria-label="Open the teaming agenda">
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

/* How far past tomorrow the day view looks. A rolling week rather than
   "until Sunday": on a Friday the latter shows almost nothing, and Friday is
   exactly when you want to see what is coming. */
const AHEAD = 5;

export function DayTab({ caseload, today, counts, supplies, soon, openCount, unsent, reminderDay, familyById, changedFamilies, theirChanges, theirName, agendaCount, isTeamingBlock, teamingBlock, live, liveAsOf, calendarName, events, detectFamily, overdue, onOpenOverdue, onCatchUp, onOpenTeaming, onFlash, onOpenFamily, onGoTexts }) {
  const { families, blocks } = caseload;
  const standing = agendaFor(families, blocks, today);

  /* The calendar wins when it has something to say about today. When it is
     connected but empty for today, the standing slots are still shown, and
     labelled, because a quiet calendar and a wrong board look identical
     otherwise. */
  const usingLive = Array.isArray(live) && live.length > 0;
  const agenda = usingLive ? live : standing;
  const liveButEmpty = Array.isArray(live) && live.length === 0;

  /* The calendar is fetched a fortnight ahead, so every day below today can be
     the real one too rather than the slots someone typed in months ago. */
  const agendaOn = (date) => {
    const fromCal = events ? liveAgendaFor(events, date, families, detectFamily) : null;
    return fromCal && fromCal.length ? fromCal : agendaFor(families, blocks, date);
  };

  const tomorrow = addDays(today, 1);
  const tomorrowAgenda = agendaOn(tomorrow);

  /* The rest of the week, days with nothing on them left out. Seeing every
     family you have coming, in one place, is the thing this screen was
     missing: the week was only ever reachable by opening each day. */
  const rest = [];
  for (let i = 2; i <= AHEAD + 1; i++) {
    const date = addDays(today, i);
    const items = agendaOn(date);
    if (items.length) rest.push({ date, items });
  }
  /* Counted over the days actually listed under that heading, tomorrow's
     excluded: a count that includes families the reader cannot see in the
     list below it is just a number that does not add up. */
  const familiesAhead = new Set(
    rest.flatMap((d) => d.items).filter((i) => i.kind === "visit").map((i) => i.c.id)
  );

  const oldestOverdue = overdue?.length
    ? Math.max(...overdue.map((t) => -(dueInfo(t.due, today)?.days ?? 0)))
    : 0;

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

  /* Things worth raising at teaming occur to you on a Monday, not at nine on
     Thursday morning. The block itself is only on the day it falls, so when it
     is not on screen the agenda still needs a door. */
  const teamingShown = [agenda, tomorrowAgenda, ...rest.map((d) => d.items)]
    .flat()
    .some((i) => isTeamingBlock(i));

  /* One row, wherever it falls in the week. */
  const rowsFor = (items, keyPrefix) =>
    items.map((item, i) =>
      item.kind === "visit" ? (
        <VisitRow
          key={`${keyPrefix}${item.c.id}`}
          c={item.c}
          count={counts[item.c.id]?.open || 0}
          overdue={counts[item.c.id]?.overdue || 0}
          supplies={supplies[item.c.id]}
          changed={changedFamilies.has(item.c.id)}
          time={item.time}
          onClick={() => onOpenFamily(item.c.id)}
        />
      ) : (
        <BlockRow
          key={`${keyPrefix}b${i}`}
          item={item}
          teaming={isTeamingBlock(item)}
          agendaCount={agendaCount}
          onOpenTeaming={onOpenTeaming}
        />
      )
    );

  return (
    <>
      <div style={S.h1}>{LONG[today.getDay()]}</div>
      <div style={S.sub}>
        {fmtDay(today)} · {openCount} open
        {usingLive && liveAsOf
          ? ` · from ${calendarName || "your calendar"}, ${asOf(liveAsOf)}`
          : calendarName
            ? " · swipe to change tabs"
            : " · standing times"}
      </div>

      {/* Each phone signs into its own Google account, so the two of them can
          be reading different calendars, or one of them none at all, and the
          screens look identical. Saying which one this is answers it. */}
      {liveButEmpty && (
        <div style={{ ...S.tip, marginTop: -6, marginBottom: 12 }}>
          Nothing on {calendarName || "your calendar"} today. Showing the standing slots instead.
        </div>
      )}

      {!calendarName && (
        <div style={{ ...S.tip, marginTop: -6, marginBottom: 12 }}>
          This phone is not reading a calendar, so these are the standing times.
          Connect one under Sharing and backup to see the real ones.
        </div>
      )}

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

      <div style={{ ...S.h2, marginTop: 0 }}>Today</div>
      {rowsFor(agenda, "t")}
      {agenda.length === 0 && <div style={S.empty}>No visits today.</div>}

      <div style={S.h2}>Tomorrow · {spokenDate(tomorrow)}</div>
      {rowsFor(tomorrowAgenda, "m")}
      {tomorrowAgenda.length === 0 && <div style={S.empty}>Nothing booked tomorrow.</div>}

      {unsent.length > 0 && reminderDay && (
        <button onClick={onGoTexts} style={S.nudge}>
          <div style={S.nudgeTitle}>Send reminders for {spokenDate(reminderDay)}</div>
          <div style={S.nudgeSub}>
            {unsent.map(({ c, time }) => `${c.name} at ${time}`).join(", ")}
          </div>
        </button>
      )}

      <div style={S.h2}>
        The rest of the week
        {familiesAhead.size > 0 ? ` · ${familiesAhead.size} ${familiesAhead.size === 1 ? "family" : "families"} ahead` : ""}
      </div>
      {rest.map(({ date, items }) => (
        <div key={date.toISOString()}>
          <div style={S.dayLabel}>{spokenDate(date)}</div>
          {rowsFor(items, `${date.getDate()}-`)}
        </div>
      ))}
      {rest.length === 0 && <div style={S.empty}>Nothing else booked in the next few days.</div>}

      {teamingBlock && !teamingShown && (
        <button onClick={onOpenTeaming} style={S.nudge} aria-label="Open the teaming agenda">
          <div style={S.nudgeTitle}>To bring up {LONG[teamingBlock.day]}</div>
          <div style={S.nudgeSub}>
            {agendaCount > 0
              ? `${agendaCount} on the list for ${teamingBlock.label.split(",")[0].toLowerCase()}`
              : "Nothing on the list yet. Add it while you are thinking of it."}
          </div>
        </button>
      )}

      {/* A date that has been red for a fortnight has stopped being a prompt.
          Listing them here only made the bottom of this screen unreadable, so
          they get a door and a screen where each one is one tap. */}
      {overdue?.length > 0 && (
        <button
          onClick={onOpenOverdue}
          style={{ ...S.nudge, background: "#FDF0F2", borderColor: "#F0CBD2" }}
        >
          <div style={S.nudgeTitle}>{overdue.length} past due</div>
          {/* Deliberately no names here. Two truncated ones tell you less than
              the age of the oldest, and this screen is for the day: a family
              with no standing visit does not belong on it, even in a list. */}
          <div style={S.nudgeSub}>
            {oldestOverdue
              ? `The oldest is ${oldestOverdue} days over. Tap to work through them.`
              : "Tap to work through them."}
          </div>
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
