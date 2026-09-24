import React, { useMemo, useState } from "react";
import { S, LINE } from "../styles.js";
import { spokenDate, addDays, dueInfo } from "../lib/dates.js";
import { nameOf } from "../lib/identity.js";
import { pillStyle } from "./Task.jsx";
import { isSupervision } from "../data/library.js";
import { latestVisitByFamily, isEarlier } from "../lib/current.js";

/** The next time this standing meeting comes round, today included. */
function nextOccurrence(block, today) {
  if (!block) return null;
  return addDays(today, (block.day - today.getDay() + 7) % 7);
}

/**
 * What to bring up on Thursday.
 *
 * Things worth raising with Mo surface all week and are forgotten by the time
 * the meeting starts. Anything can be flagged for teaming as it comes up, and
 * a note's "bring to the clinical partner" items land here on their own. Both
 * of them add to the same list, so it is ready before either sits down.
 */
export function TeamingTab({ block, families, familyById, tasks, today, board, onOpenFamily, onFlash }) {
  const [text, setText] = useState("");
  const [cid, setCid] = useState("");
  const [important, setImportant] = useState(false);
  const [openId, setOpenId] = useState(null);

  const when = nextOccurrence(block, today);
  const isToday = when && when.getDay() === today.getDay();

  /* Thursday's list is for this Thursday. Something a note marked for the
     clinician before the family's latest visit, and that nobody has touched
     since, was for an earlier meeting; the newer note carries forward what
     still matters. */
  const latest = useMemo(() => latestVisitByFamily(tasks), [tasks]);
  const items = useMemo(() => tasks.filter((t) => t.agenda && !isEarlier(t, latest)), [tasks, latest]);

  /* What the notes marked for reflective supervision, which is not this
     meeting. [team] lines are for Thursday and are already in the list above;
     [individual] and [group] ones used to land either here, in the wrong
     meeting, or among a family's to-dos, where nobody looks while preparing
     for supervision. They are gathered below Thursday's list, by meeting. */
  const supervision = useMemo(
    () => tasks.filter((t) => isSupervision(t) && t.forum !== "team" && !t.done && !isEarlier(t, latest)),
    [tasks, latest]
  );
  const forMine = supervision.filter((t) => t.forum !== "group");
  const forGroup = supervision.filter((t) => t.forum === "group");
  /* Flagged first inside each family: the meeting is short and the order on
     screen is the order it gets talked about. */
  const open = items
    .filter((t) => !t.done)
    .slice()
    .sort((a, b) => (b.important ? 1 : 0) - (a.important ? 1 : 0));
  const done = items.filter((t) => t.done);

  /* Grouped by family, with the unattached ones last: the meeting tends to
     move family by family. */
  const groups = useMemo(() => {
    const byFamily = new Map();
    const loose = [];
    for (const t of open) {
      if (!t.client) { loose.push(t); continue; }
      if (!byFamily.has(t.client)) byFamily.set(t.client, []);
      byFamily.get(t.client).push(t);
    }
    const ordered = families.filter((f) => byFamily.has(f.id)).map((f) => ({ family: f, rows: byFamily.get(f.id) }));
    if (loose.length) ordered.push({ family: null, rows: loose });
    return ordered;
  }, [open, families]);

  function add(e) {
    e.preventDefault();
    const t = text.trim();
    if (t.length < 2) return;
    board.addQuick({
      text: t,
      client: cid || null,
      lane: "both",
      kind: "admin",
      agenda: true,
      important,
    });
    setText("");
    setImportant(false);
    onFlash?.(cid ? `Added for ${familyById.get(cid)?.name || "them"}` : "Added to Thursday");
  }

  return (
    <>
      <div style={S.h1}>{block?.label?.split(",")[0] || "Teaming"}</div>
      <div style={S.sub}>
        {when
          ? isToday
            ? `Today at ${block.time}. ${open.length} to bring up.`
            : `${spokenDate(when)} at ${block.time}. ${open.length} to bring up.`
          : "No standing teaming slot on the calendar."}
      </div>

      <form style={S.quickAdd} onSubmit={add}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What do you want to bring up?"
          style={{ ...S.editInput, flex: 1 }}
          aria-label="Add something to bring up at teaming"
          data-noswipe
        />
        <button type="submit" style={{ ...S.mini, ...(text.trim() ? S.miniOn : {}) }}>Add</button>
      </form>

      {/* Who it is about and whether it has to be reached, set before it goes
          on rather than left for later, because later is Thursday morning. */}
      <div style={{ ...S.rowWrap, marginTop: 6 }}>
        <label className="sr-only" htmlFor="teamfam">Family this is about</label>
        <select
          id="teamfam"
          value={cid}
          onChange={(e) => setCid(e.target.value)}
          style={S.select}
          data-noswipe
        >
          <option value="">Not about one family</option>
          {families.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <button
          type="button"
          onClick={() => setImportant((v) => !v)}
          style={{ ...S.mini, ...(important ? { ...S.miniOn, background: "#C62A40", borderColor: "#C62A40" } : {}) }}
          aria-pressed={important}
        >
          {important ? "★ Must cover" : "☆ Must cover"}
        </button>
      </div>

      <div style={{ ...S.tip, marginTop: 4, marginBottom: 18 }}>
        Anything either of you flags for teaming lands here, and items a visit note
        marks for the clinician arrive on their own.
      </div>

      {open.length === 0 && (
        <div style={S.empty}>
          Nothing on the list yet. Add it above, or open a task and tap “Bring to teaming”.
        </div>
      )}

      {groups.map(({ family, rows }) => (
        <div key={family ? family.id : "loose"} style={{ marginBottom: 6 }}>
          <button
            onClick={() => family && onOpenFamily(family.id)}
            style={{
              display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left",
              background: "transparent", border: "none", padding: "14px 2px 6px",
              fontFamily: "inherit", color: "inherit", cursor: family ? "pointer" : "default",
            }}
          >
            {family && <span style={{ ...S.dot, background: family.color }} aria-hidden="true" />}
            <span style={{ fontSize: 14.5, fontWeight: 700 }}>
              {family ? family.name : "Across the caseload"}
            </span>
            <span style={{ fontSize: 12, opacity: 0.45 }}>{rows.length}</span>
          </button>

          {rows.map((t) => {
            const d = dueInfo(t.due, today);
            const showing = openId === t.id;
            return (
              <div key={t.id} style={{ borderBottom: `1px solid ${LINE}` }}>
                <div style={{ ...S.taskTop, paddingBottom: 10 }} className="handed">
                  <button
                    onClick={() => board.toggle(t.id)}
                    style={{
                      ...S.box,
                      borderColor: t.important ? "#C62A40" : family ? family.color : "#B9AECE",
                    }}
                    role="checkbox"
                    aria-checked={false}
                    aria-label={`Mark discussed: ${t.text}`}
                  />
                  {/* The whole line opens it. The old row had a tiny tick and a
                      tiny "off" side by side, and "off" on something with no
                      family put it out of reach, so the destructive one is no
                      longer the easy one to hit by mistake. */}
                  <button
                    onClick={() => setOpenId(showing ? null : t.id)}
                    style={{ ...S.taskText, fontSize: 13.5, lineHeight: 1.45 }}
                    aria-expanded={showing}
                  >
                    {t.important && <span style={{ color: "#C62A40", fontWeight: 800 }}>★ </span>}
                    {t.text}
                    {(t.note || t.by) && (
                      <span style={{ display: "block", fontSize: 11.5, opacity: 0.55, marginTop: 3, lineHeight: 1.45 }}>
                        {t.by && t.by !== "unknown" ? `${nameOf(t.by)} added this` : ""}
                        {t.by && t.by !== "unknown" && t.note ? " · " : ""}
                        {t.note ? t.note.slice(0, 90) + (t.note.length > 90 ? "…" : "") : ""}
                      </span>
                    )}
                  </button>
                  {d && <span style={{ ...S.pill, ...pillStyle(d) }}>{d.label}</span>}
                </div>

                {showing && (
                  <div style={{ ...S.taskBody, paddingBottom: 14 }} className="handed-body">
                    <div style={S.editLabel}>Family this is about</div>
                    <select
                      value={t.client || ""}
                      onChange={(e) => board.update(t.id, { client: e.target.value || null })}
                      style={{ ...S.select, width: "100%", flex: "none" }}
                      aria-label="Family this is about"
                      data-noswipe
                    >
                      <option value="">Not about one family</option>
                      {families.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>

                    <div style={{ ...S.rowWrap, marginTop: 10 }}>
                      <button
                        onClick={() => board.update(t.id, { important: !t.important })}
                        style={{ ...S.mini, ...(t.important ? { ...S.miniOn, background: "#C62A40", borderColor: "#C62A40" } : {}) }}
                        aria-pressed={!!t.important}
                      >
                        {t.important ? "★ Must cover" : "☆ Must cover"}
                      </button>
                      <button
                        onClick={() => {
                          board.update(t.id, { agenda: false });
                          setOpenId(null);
                          onFlash?.(
                            t.client
                              ? `Off the list, still on ${familyById.get(t.client)?.name || "the family"}`
                              : "Off the list, in Families under “not tied to a family”"
                          );
                        }}
                        style={S.mini}
                        aria-label={`Take off the teaming list: ${t.text}`}
                      >
                        Take off the list
                      </button>
                    </div>
                    {t.note && (
                      <>
                        <div style={{ ...S.editLabel, marginTop: 12 }}>Note</div>
                        <div style={{ fontSize: 13, lineHeight: 1.5, opacity: 0.75 }}>{t.note}</div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      {[["For my supervision", forMine], ["For group supervision", forGroup]].map(([title, rows]) =>
        rows.length > 0 && (
          <div key={title}>
            <div style={S.h2}>{title} ({rows.length})</div>
            {rows.map((t) => {
              const f = t.client ? familyById.get(t.client) : null;
              return (
                <div key={t.id} style={{ ...S.taskTop, borderBottom: `1px solid ${LINE}` }} className="handed">
                  <button
                    onClick={() => board.toggle(t.id)}
                    style={{ ...S.box, borderColor: f ? f.color : "#B9AECE" }}
                    role="checkbox"
                    aria-checked={false}
                    aria-label={`Mark taken to supervision: ${t.text}`}
                  />
                  <span style={{ ...S.taskText, cursor: "default", fontSize: 13.5, lineHeight: 1.45 }}>
                    {f && <span style={{ fontWeight: 700 }}>{f.name} · </span>}
                    {t.text}
                  </span>
                </div>
              );
            })}
          </div>
        )
      )}

      {done.length > 0 && (
        <>
          <div style={S.h2}>Talked about ({done.length})</div>
          {done.map((t) => {
            const f = t.client ? familyById.get(t.client) : null;
            return (
              <button
                key={t.id}
                onClick={() => board.toggle(t.id)}
                style={{ ...S.dueRow, opacity: 0.5 }}
              >
                <span style={{ ...S.dot, width: 10, height: 10, marginTop: 5, background: f ? f.color : "#B9AECE" }} aria-hidden="true" />
                <span style={{ ...S.dueText, textDecoration: "line-through" }}>
                  {f && <span style={{ fontWeight: 700 }}>{f.name} · </span>}
                  {t.text}
                </span>
              </button>
            );
          })}
          <div style={{ ...S.tip, marginTop: 10 }}>
            Tap one to put it back if it needs another round.
          </div>
        </>
      )}
    </>
  );
}

export { nextOccurrence };
