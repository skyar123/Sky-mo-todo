import React from "react";
import { S } from "../styles.js";
import { Fold, Field } from "./bits.jsx";
import { Task, QuickAdd } from "./Task.jsx";
import { SUPPLIES, KIND, ORDER, isSupervision } from "../data/library.js";
import { LONG, iso, fmtShort, parseISO } from "../lib/dates.js";
import { isScheduled } from "../lib/schedule.js";
import { latestVisitByFamily, isEarlier } from "../lib/current.js";
import { LINE } from "../styles.js";

export function FamilyDetail({ c, tasks, families, familyById, supplies, drops, today, board, who, onFlash, onBack }) {
  const all = tasks.filter((x) => x.client === c.id);
  /* The family's current to-dos; what its notes marked for supervision;
     and what earlier visits left that nobody touched once a newer note came
     in. Supervision prompts used to be counted as open tasks without being
     shown, and earlier leftovers made every family look like twenty jobs. */
  const latest = latestVisitByFamily(tasks);
  const mine = all.filter((x) => !isSupervision(x) && !isEarlier(x, latest));
  const earlier = all.filter((x) => !isSupervision(x) && isEarlier(x, latest));
  const forSupervision = all.filter((x) => isSupervision(x) && !x.done);
  const openCount = mine.filter((x) => !x.done).length;
  const sup = supplies[c.id] || [];
  const lastDrop = drops[c.id] ? parseISO(drops[c.id]) : null;

  const where = isScheduled(c) ? `${LONG[c.day]} ${c.time}, ${c.place}` : c.place;

  return (
    <>
      <div style={S.famNav}>
        <button onClick={onBack} style={S.back}>‹ back</button>
        <span style={S.swipeHint}>swipe for next family</span>
      </div>

      <div style={S.heroRow}>
        <span style={{ ...S.dot, background: c.color, width: 16, height: 16, marginTop: 8 }} aria-hidden="true" />
        <div>
          <div style={S.h1}>{c.name}</div>
          <div style={S.sub}>
            {c.child}{c.child && " · "}{where} · with {c.clinician}
          </div>
        </div>
      </div>

      {(c.caregiver || c.childNote || c.bring) && (
        <Fold title="Before you go in" defaultOpen>
          {c.bring && <Field label="Bring" body={c.bring} />}
          {c.caregiver && <Field label="How this caregiver wants to be met" body={c.caregiver} />}
          {c.childNote && <Field label="How this child is reached" body={c.childNote} />}
        </Fold>
      )}

      <Fold title={`Supplies${sup.length ? ` (${sup.length})` : ""}`} defaultOpen={sup.length > 0}>
        <div style={S.fieldLabel}>What they said yes to. Tap to change.</div>
        <div style={{ ...S.rowWrap, marginTop: 8 }}>
          {SUPPLIES.map((s) => {
            const on = sup.includes(s);
            return (
              <button
                key={s}
                onClick={() => board.toggleSupply(c.id, s)}
                style={{ ...S.mini, ...(on ? { background: c.color, color: "#fff", borderColor: c.color } : {}) }}
                aria-pressed={on}
              >
                {s}
              </button>
            );
          })}
        </div>
        {sup.length > 0 && (
          <div style={S.rowWrap}>
            <button
              onClick={() => board.setDrops((p) => ({ ...p, [c.id]: iso(today) }))}
              style={S.mini}
            >
              Log a drop today
            </button>
            {lastDrop && <span style={S.dropNote}>last drop {fmtShort(lastDrop)}</span>}
          </div>
        )}
      </Fold>

      <Fold title={`Open tasks (${openCount})`} defaultOpen>
        {ORDER.map((g) => {
          const rows = mine.filter((x) => x.kind === g);
          if (!rows.length) return null;
          return (
            <div key={g} style={{ marginBottom: 10 }}>
              <div style={S.kindHead}>{KIND[g]}</div>
              {rows.map((x) => (
                <Task
                  key={x.id}
                  x={x}
                  color={c.color}
                  today={today}
                  families={families}
                  familyById={familyById}
                  board={board}
                  who={who}
                  onFlash={onFlash}
                />
              ))}
            </div>
          );
        })}
        {mine.length === 0 && <div style={S.empty}>Nothing on this family yet.</div>}
        <QuickAdd client={c.id} board={board} onFlash={onFlash} />
      </Fold>

      {earlier.length > 0 && (
        <Fold title={`From earlier visits (${earlier.length})`}>
          <div style={{ ...S.fieldLabel, marginBottom: 6 }}>
            Left by an older note that a newer one has replaced, and not touched
            since. The newer note is the plan now. Tick what got done; anything
            still needed goes back on the list.
          </div>
          {earlier.map((x) => (
            <div key={x.id} data-earlier={x.id} style={{ ...S.taskTop, borderBottom: `1px solid ${LINE}`, alignItems: "center" }} className="handed">
              <button
                onClick={() => board.toggle(x.id)}
                style={{ ...S.box, borderColor: c.color }}
                role="checkbox"
                aria-checked={false}
                aria-label={`Mark done: ${x.text}`}
              />
              <span style={{ ...S.taskText, cursor: "default", opacity: 0.75 }}>
                {x.text}
                {x.noted && <span style={{ display: "block", fontSize: 11.5, opacity: 0.6 }}>from the {fmtShort(parseISO(x.noted))} note</span>}
              </span>
              <button onClick={() => { board.update(x.id, { kept: true }); onFlash?.("Back on the list"); }} style={S.mini}>
                Still needed
              </button>
            </div>
          ))}
        </Fold>
      )}

      {forSupervision.length > 0 && (
        <Fold title={`For supervision (${forSupervision.length})`}>
          <div style={{ ...S.fieldLabel, marginBottom: 6 }}>
            From this family's notes. Not tasks: the questions to take into the room.
            All of them are also on the teaming screen.
          </div>
          {forSupervision.map((x) => (
            <Task
              key={x.id}
              x={x}
              color={c.color}
              today={today}
              families={families}
              familyById={familyById}
              board={board}
              who={who}
              onFlash={onFlash}
            />
          ))}
        </Fold>
      )}

      {c.watch.length > 0 && (
        <Fold title="Watching">
          {c.watch.map((w, i) => <div key={i} style={S.watchRow}>{w}</div>)}
        </Fold>
      )}
      {c.goals.length > 0 && (
        <Fold title="What we're working on">
          {c.goals.map((g, i) => <div key={i} style={S.watchRow}>{g}</div>)}
        </Fold>
      )}
    </>
  );
}
