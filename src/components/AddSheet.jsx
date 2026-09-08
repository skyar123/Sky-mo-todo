import React, { useState } from "react";
import { S } from "../styles.js";
import { parseNotes } from "../lib/parse.js";

export function AddSheet({ families, today, close, add, flash }) {
  const [txt, setTxt] = useState("");
  const [cid, setCid] = useState("");
  const [lane, setLane] = useState("both");

  function make() {
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
        <div style={{ ...S.h2, marginTop: 0 }}>Paste notes</div>
        <div style={S.sub}>
          One thought per line. Family names and dates like 9/22 get picked up on their own.
          New tasks go to Both unless you change it.
        </div>
        <label className="sr-only" htmlFor="notes">Notes to turn into tasks</label>
        <textarea
          id="notes"
          value={txt}
          onChange={(e) => setTxt(e.target.value)}
          rows={5}
          style={S.textarea}
          placeholder={"call the school about the referral\nSNIFF 9/22\nbring diapers"}
        />
        <div style={S.rowWrap}>
          <label className="sr-only" htmlFor="fam">Family</label>
          <select id="fam" value={cid} onChange={(e) => setCid(e.target.value)} style={S.select}>
            <option value="">detect family</option>
            {families.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <label className="sr-only" htmlFor="lane">Whose list</label>
          <select id="lane" value={lane} onChange={(e) => setLane(e.target.value)} style={S.select}>
            <option value="both">Both</option>
            <option value="sky">Me</option>
            <option value="mo">Mo</option>
          </select>
        </div>
        <button onClick={make} style={S.bigBtn}>Add</button>
        <button onClick={close} style={S.textBtn}>Cancel</button>
      </div>
    </div>
  );
}
