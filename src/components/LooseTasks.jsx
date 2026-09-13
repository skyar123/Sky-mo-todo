import React from "react";
import { S } from "../styles.js";
import { Task } from "./Task.jsx";

/* Everything that belongs to the caseload rather than to one family.
   Supervision topics, admin, anything typed into the teaming box before it
   had a family. These used to be visible only while they sat on the teaming
   list, so taking one off that list left it with no screen at all: still on
   the board, findable only by searching for words you no longer remembered.
   This is the screen that was missing. */
export function LooseTasks({ tasks, families, familyById, today, board, who, onFlash, onBack }) {
  const mine = tasks.filter((x) => !x.client);
  const open = mine.filter((x) => !x.done);
  const done = mine.filter((x) => x.done);

  return (
    <>
      <button onClick={onBack} style={S.back}>‹ back</button>
      <div style={S.h1}>Not tied to a family</div>
      <div style={S.sub}>
        {open.length ? `${open.length} open` : "Nothing open"}
        {done.length ? ` · ${done.length} done` : ""}
        . Give one a family from inside it and it moves to that family's list.
      </div>

      {!mine.length && (
        <div style={S.empty}>Nothing here. Items you add for the caseload as a whole land on this screen.</div>
      )}

      {[...open, ...done].map((x) => (
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
        />
      ))}
    </>
  );
}
