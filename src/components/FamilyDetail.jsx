import React, { useRef } from "react";
import { S } from "../styles.js";
import { Fold, Field } from "./bits.jsx";
import { Task, QuickAdd } from "./Task.jsx";
import { SUPPLIES, KIND, ORDER, isSupervision } from "../data/library.js";
import { LONG, iso, fmtShort, parseISO } from "../lib/dates.js";
import { isScheduled } from "../lib/schedule.js";
import { latestVisitByFamily, isEarlier, isTodo } from "../lib/current.js";
import { paperworkDue } from "../lib/paperwork.js";
import { PaperRow, usePaperTick } from "./Paperwork.jsx";
import { Archive } from "./Archive.jsx";
import { useSettle, doneAt } from "../lib/useSettle.js";
import { LINE } from "../styles.js";

const RECENT_PAPER_MS = 30 * 86400000;

export function FamilyDetail({ c, tasks, families, familyById, supplies, drops, today, board, who, onFlash, onBack }) {
  const all = tasks.filter((x) => x.client === c.id);
  /* The family's current to-dos; what its notes marked for supervision;
     and what earlier visits left that nobody touched once a newer note came
     in. Supervision prompts used to be counted as open tasks without being
     shown, and earlier leftovers made every family look like twenty jobs. */
  const latest = latestVisitByFamily(tasks);
  /* A ticked task stays in its place while it fades (see useSettle), and
     only then moves to the Done list under it. `from` remembers which list
     it was ticked in, so it fades where it was. */
  const settle = useSettle();
  const from = useRef(new Map());
  const tick = (where) => (x) => {
    if (x.done) {
      board.toggle(x.id);
      onFlash?.("Back on the list");
      return;
    }
    from.current.set(x.id, where);
    settle.settle(x.id, () => board.toggle(x.id));
    onFlash?.("Done", { label: "Undo", run: () => board.toggle(x.id) });
  };
  const fadingIn = (where) => (x) => settle.isLeaving(x.id) && from.current.get(x.id) === where;
  const paper = usePaperTick(board, onFlash);

  const mine = all.filter((x) => isTodo(x, latest));
  /* What the case calendar asks of this family in the next two months, and
     what is already late. Further out is noise on a phone; when nothing is
     that close, the next step is shown so the page never says "nothing". */
  const paperSoon = paperworkDue(all, today, 60);
  const paperNext = paperSoon.length ? [] : paperworkDue(all, today, 400).slice(0, 1);
  const paperRecent = all.filter((t) => t.paper && t.done && doneAt(t) > Date.now() - RECENT_PAPER_MS);
  const paperShown = [...paperSoon, ...paperNext, ...paperRecent.filter((t) => paper.settle.isLeaving(t.id))]
    .sort((a, b) => a.due.localeCompare(b.due));
  const paperArchived = paperRecent.filter((t) => !paper.settle.isLeaving(t.id));
  const admitted = parseISO(c.admit || "");
  /* Supervision prompts fold with the rest of their visit: a reflection from
     three visits ago was for a supervision that has already happened. */
  const earlier = all.filter((x) => isEarlier(x, latest) || fadingIn("earlier")(x));
  const supervisionAll = all.filter((x) => isSupervision(x) && !isEarlier(x, latest));
  const forSupervision = supervisionAll.filter((x) => !x.done || fadingIn("supervision")(x));
  const supervisionDone = supervisionAll.filter((x) => x.done && !settle.isLeaving(x.id));
  /* Open, plus anything ticked here a moment ago and still fading. */
  const showing = mine.filter((x) => !x.done || fadingIn("tasks")(x));
  const finished = mine.filter((x) => x.done && !settle.isLeaving(x.id));
  const openCount = mine.filter((x) => !x.done).length;
  const taskRow = (where) => (x) => (
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
      onToggle={tick(where)}
      leaving={settle.isLeaving(x.id)}
    />
  );
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

      <Fold title={`Paperwork${paperSoon.length ? ` (${paperSoon.length})` : ""}`} defaultOpen={paperSoon.length > 0}>
        {admitted ? (
          <>
            <div style={{ ...S.fieldLabel, marginBottom: 6 }}>
              Admitted {fmtShort(admitted)}{c.admitEstimated ? " (estimated, confirm it)" : ""}. Dates below count from it.
            </div>
            {paperShown.map((t) => (
              <PaperRow key={t.id} t={t} family={c} today={today} onTick={paper.onTick} leaving={paper.settle.isLeaving(t.id)} showFamily={false} />
            ))}
            {paperNext.length > 0 && <div style={S.tip}>Nothing due in the next two months. That is the next step.</div>}
            <Archive
              title="Done lately"
              rows={paperArchived}
              settle={paper.settle}
              render={(t) => <PaperRow t={t} family={c} today={today} onTick={paper.onTick} showFamily={false} />}
            />
          </>
        ) : (
          <div style={S.tip}>
            No admission date for {c.name} yet, so the SNIFFs, plan reviews and batteries
            are not dated. Once it is added to the caseload they appear here and on the day screen.
          </div>
        )}
      </Fold>

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
          const rows = showing.filter((x) => x.kind === g);
          if (!rows.length) return null;
          return (
            <div key={g} style={{ marginBottom: 10 }}>
              <div style={S.kindHead}>{KIND[g]}</div>
              {rows.map(taskRow("tasks"))}
            </div>
          );
        })}
        {showing.length === 0 && (
          <div style={S.empty}>{finished.length ? "Everything here is done." : "Nothing on this family yet."}</div>
        )}
        <QuickAdd client={c.id} board={board} onFlash={onFlash} />
        <Archive rows={finished} settle={settle} render={taskRow("done")} />
      </Fold>

      {earlier.length > 0 && (
        <Fold title={`From earlier visits (${earlier.length})`}>
          <div style={{ ...S.fieldLabel, marginBottom: 6 }}>
            Left by an older note that a newer one has replaced, and not touched
            since. The newer note is the plan now. Tick what got done; anything
            still needed goes back on the list.
          </div>
          {earlier.map((x) => (
            <div
              key={x.id}
              data-earlier={x.id}
              data-row={x.id}
              style={{ ...S.taskTop, borderBottom: `1px solid ${LINE}`, alignItems: "center" }}
              className={`handed${settle.isLeaving(x.id) ? " skmo-leaving" : ""}`}
            >
              <button
                onClick={() => tick("earlier")(x)}
                style={{ ...S.box, borderColor: c.color, background: x.done ? c.color : "transparent" }}
                role="checkbox"
                aria-checked={!!x.done}
                aria-label={`Mark done: ${x.text}`}
              >
                <span aria-hidden="true" className={x.done ? "skmo-check" : undefined}>{x.done ? "✓" : ""}</span>
              </button>
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

      {supervisionAll.length > 0 && (
        <Fold title={`For supervision (${forSupervision.length})`}>
          <div style={{ ...S.fieldLabel, marginBottom: 6 }}>
            From this family's notes. Not tasks: the questions to take into the room.
            All of them are also on the teaming screen.
          </div>
          {forSupervision.map(taskRow("supervision"))}
          <Archive title="Taken to supervision" rows={supervisionDone} settle={settle} render={taskRow("done")} />
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
