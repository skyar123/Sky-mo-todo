import React from "react";
import { S } from "../styles.js";
import { Task } from "./Task.jsx";
import { Archive } from "./Archive.jsx";
import { useSettle } from "../lib/useSettle.js";
import { isSupervision } from "../data/library.js";

/* Everything that belongs to the caseload rather than to one family.
   Supervision topics, admin, anything typed into the teaming box before it
   had a family. These used to be visible only while they sat on the teaming
   list, so taking one off that list left it with no screen at all: still on
   the board, findable only by searching for words you no longer remembered.
   This is the screen that was missing. */
export function LooseTasks({ tasks, families, familyById, today, board, who, onFlash, onBack }) {
  /* Supervision prompts with no family are not to-dos either; they are on
     the teaming screen, under the supervision they are for. */
  const mine = tasks.filter((x) => !x.client && !isSupervision(x));
  const settle = useSettle();
  /* Open, plus anything ticked a moment ago that is still fading. */
  const showing = mine.filter((x) => !x.done || settle.isLeaving(x.id));
  const done = mine.filter((x) => x.done && !settle.isLeaving(x.id));
  const openCount = mine.filter((x) => !x.done).length;
  const tick = (x) => {
    if (x.done) {
      board.toggle(x.id);
      onFlash?.("Back on the list");
      return;
    }
    settle.settle(x.id, () => board.toggle(x.id));
    onFlash?.("Done", { label: "Undo", run: () => board.toggle(x.id) });
  };
  const row = (x) => (
    <Task
      key={x.id}
      x={x}
      color="#B9AECE"
      today={today}
      families={families}
      familyById={familyById}
      board={board}
      who={who}
      onFlash={onFlash}
      onToggle={tick}
      leaving={settle.isLeaving(x.id)}
    />
  );

  return (
    <>
      <button onClick={onBack} style={S.back}>‹ back</button>
      <div style={S.h1}>Not tied to a family</div>
      <div style={S.sub}>
        {openCount ? `${openCount} open` : "Nothing open"}
        {done.length ? ` · ${done.length} done` : ""}
        . Give one a family from inside it and it moves to that family's list.
      </div>

      {!mine.length && (
        <div style={S.empty}>Nothing here. Items you add for the caseload as a whole land on this screen.</div>
      )}

      {showing.map(row)}
      <Archive rows={done} settle={settle} render={row} />
    </>
  );
}
