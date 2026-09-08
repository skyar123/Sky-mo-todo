import React, { useMemo, useState } from "react";
import { S, LINE } from "../styles.js";
import { parseNotes } from "../lib/parse.js";
import { extractFromNote, itemsToTasks } from "../lib/extract.js";

/* A full visit note and a scratch list of thoughts want different treatment.
   A note carries its own structure, so it gets read structurally and shown
   back for approval before anything lands. A handful of lines does not need
   that ceremony. */
const looksLikeNote = (t) =>
  /[\u2610\u25A2\u25A1\u25FB]/u.test(t) ||
  /follow[- ]?up/i.test(t) ||
  /[\u{1F64B}\u{1F465}\u{1F310}]/u.test(t) ||
  t.length > 900;

export function AddSheet({ families, today, close, add, flash }) {
  const [txt, setTxt] = useState("");
  const [cid, setCid] = useState("");
  const [lane, setLane] = useState("both");
  const [skipped, setSkipped] = useState({});

  const isNote = useMemo(() => looksLikeNote(txt), [txt]);
  const parsed = useMemo(
    () => (isNote && txt.trim() ? extractFromNote(txt, { families, today }) : null),
    [isNote, txt, families, today]
  );

  const chosen = parsed ? parsed.items.filter((_, i) => !skipped[i]) : [];
  const familyName = parsed?.client
    ? families.find((f) => f.id === parsed.client)?.name
    : null;

  function commit() {
    if (parsed) {
      if (!chosen.length) {
        flash("Nothing selected");
        return;
      }
      add(itemsToTasks(chosen, { client: cid || parsed.client }));
      flash(`${chosen.length} added`);
      close();
      return;
    }
    const made = parseNotes(txt, { families, today, forcedClient: cid, lane });
    if (!made.length) {
      flash("Nothing to add yet");
      return;
    }
    add(made);
    flash(`${made.length} added`);
    close();
  }

  return (
    <div style={S.scrim} onClick={close}>
      <div style={S.sheetUp} onClick={(e) => e.stopPropagation()} data-noswipe>
        <div style={{ ...S.h2, marginTop: 0 }}>{parsed ? "From your note" : "Paste notes"}</div>
        <div style={S.sub}>
          {parsed
            ? "Paste a whole visit note and the follow-up items come out. Tap any one to leave it behind."
            : "One thought per line, or paste a whole visit note. Family names and dates like 9/22 get picked up on their own."}
        </div>

        <label className="sr-only" htmlFor="notes">Notes to turn into tasks</label>
        <textarea
          id="notes"
          value={txt}
          onChange={(e) => { setTxt(e.target.value); setSkipped({}); }}
          rows={parsed ? 3 : 5}
          style={S.textarea}
          placeholder={"call the school about the referral\nSNIFF 9/22\nbring diapers"}
        />

        {parsed && (
          <div style={{ marginBottom: 14 }}>
            <div style={S.fieldLabel}>
              {familyName ? `Reads as ${familyName}` : "No family recognised, pick one below"}
              {" · "}
              {chosen.length} of {parsed.items.length}
            </div>
            <div style={{ maxHeight: "34vh", overflowY: "auto", marginTop: 8 }}>
              {parsed.items.map((item, i) => {
                const off = !!skipped[i];
                const prev = i > 0 ? parsed.items[i - 1].section : null;
                return (
                  <React.Fragment key={i}>
                    {item.section !== prev && <div style={S.kindHead}>{item.section}</div>}
                    <button
                      onClick={() => setSkipped((p) => ({ ...p, [i]: !p[i] }))}
                      style={{
                        display: "flex", gap: 9, alignItems: "flex-start", width: "100%",
                        textAlign: "left", background: "transparent", border: "none",
                        borderBottom: `1px solid ${LINE}`, padding: "9px 2px",
                        fontFamily: "inherit", color: "inherit", cursor: "pointer",
                        opacity: off ? 0.4 : 1,
                      }}
                      aria-pressed={!off}
                    >
                      <span
                        style={{
                          ...S.box, width: 18, height: 18, minWidth: 18, marginTop: 1,
                          borderColor: item.urgent ? "#C62A40" : "#B9AECE",
                          background: off ? "transparent" : item.urgent ? "#C62A40" : "#2F2A3D",
                        }}
                        aria-hidden="true"
                      >
                        {off ? "" : "✓"}
                      </span>
                      <span style={{ flex: 1, fontSize: 13, lineHeight: 1.4 }}>
                        {item.text}
                        <span style={{ display: "block", fontSize: 11, opacity: 0.5, marginTop: 2 }}>
                          {item.lane === "sky" ? "mine" : item.lane === "mo" ? "Mo" : "both"}
                          {item.due ? ` · due ${item.due}` : ""}
                        </span>
                      </span>
                    </button>
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        )}

        <div style={S.rowWrap}>
          <label className="sr-only" htmlFor="fam">Family</label>
          <select id="fam" value={cid} onChange={(e) => setCid(e.target.value)} style={S.select}>
            <option value="">{parsed ? "keep what it detected" : "detect family"}</option>
            {families.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {!parsed && (
            <>
              <label className="sr-only" htmlFor="lane">Whose list</label>
              <select id="lane" value={lane} onChange={(e) => setLane(e.target.value)} style={S.select}>
                <option value="both">Both</option>
                <option value="sky">Me</option>
                <option value="mo">Mo</option>
              </select>
            </>
          )}
        </div>

        <button onClick={commit} style={S.bigBtn}>
          {parsed ? `Add ${chosen.length}` : "Add"}
        </button>
        <button onClick={close} style={S.textBtn}>Cancel</button>
      </div>
    </div>
  );
}
