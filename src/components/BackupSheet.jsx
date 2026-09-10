import React, { useRef, useState } from "react";
import { S, LINE } from "../styles.js";
import { iso } from "../lib/dates.js";
import { PEOPLE } from "../lib/identity.js";
import { handOff } from "../lib/handoff.js";

/* Everything the board remembers lives in one browser. Clearing site data,
   a new phone or a reinstall takes it with it, so a backup is not optional
   housekeeping. The file is written locally and never uploaded. */
export function BackupSheet({ close, exportBlob, importBlob, onLock, who, setWho, shared, calendar, today, flash, storageOk }) {
  const file = useRef(null);
  const [confirmImport, setConfirmImport] = useState(null);

  function download() {
    try {
      const how = handOff(
        JSON.stringify(exportBlob(), null, 2),
        `skymo-backup-${iso(today)}.json`,
        "application/json",
        { title: "sky + mo backup" }
      );
      flash(how === "shared" ? "Choose where to keep it" : "Backup saved");
    } catch {
      flash("Could not save the file");
    }
  }

  async function pick(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      setConfirmImport(JSON.parse(await f.text()));
    } catch {
      flash("That file could not be read");
    }
  }

  function doImport() {
    try {
      importBlob(confirmImport);
      setConfirmImport(null);
      flash("Backup restored");
      close();
    } catch (err) {
      flash(err.message || "Could not restore that file");
      setConfirmImport(null);
    }
  }

  return (
    <div style={S.scrim} onClick={close}>
      <div style={S.sheetUp} onClick={(e) => e.stopPropagation()} data-noswipe>
        <div style={{ ...S.h2, marginTop: 0 }}>Board settings</div>

        {shared && (
          <div style={{ marginBottom: 16 }}>
            <div style={S.fieldLabel}>Whose phone is this</div>
            <div style={{ ...S.rowWrap, marginTop: 6 }}>
              {PEOPLE.map(([k, l]) => (
                <button
                  key={k}
                  onClick={() => setWho(k)}
                  style={{ ...S.mini, ...(who === k ? S.miniOn : {}) }}
                  aria-pressed={who === k}
                >
                  {l}
                </button>
              ))}
            </div>
            <div style={{ ...S.tip, marginTop: 4 }}>
              This board is shared. Ticks, notes and supplies sync between both of you.
              Only the labels change here, not who a task belongs to.
            </div>
          </div>
        )}

        {!storageOk && (
          <div style={{ ...S.rules, background: "#FFF1F1", borderColor: "#F5B0B0" }}>
            <div style={S.rule}>
              This browser is not saving anything. Private browsing or blocked site
              data will do that. Ticking boxes will not stick until that changes.
            </div>
          </div>
        )}

        {calendar && (
          <div style={{ marginBottom: 18, borderBottom: `1px solid ${LINE}`, paddingBottom: 16 }}>
            <div style={S.fieldLabel}>Google Calendar</div>
            {calendar.connected ? (
              <>
                <div style={{ fontSize: 13.5, lineHeight: 1.5, marginBottom: 8 }}>
                  Reading <strong>{calendar.calendar.summary}</strong>. Visit times on the day
                  view come from there rather than from what was typed in.
                </div>
                <div style={S.rowWrap}>
                  <button onClick={() => calendar.refresh({ interactive: true })} style={S.mini}>
                    {calendar.status === "working" ? "Reading…" : "Refresh now"}
                  </button>
                  <button onClick={calendar.openChoices} style={S.mini}>Change calendar</button>
                  <button onClick={calendar.disconnect} style={S.mini}>Disconnect</button>
                </div>
                {calendar.choices && (
                  <div style={S.rowWrap}>
                    {calendar.choices.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => calendar.choose(c)}
                        style={{ ...S.mini, ...(c.id === calendar.calendar.id ? S.miniOn : {}) }}
                        aria-pressed={c.id === calendar.calendar.id}
                      >
                        {c.summary}
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                <div style={{ fontSize: 13.5, lineHeight: 1.5, marginBottom: 8 }}>
                  Connect it and the day view shows what is actually on your calendar,
                  instead of the times typed into the board.
                </div>
                <button onClick={calendar.connect} style={S.bigBtn}>
                  {calendar.status === "working" ? "Connecting…" : "Connect Google Calendar"}
                </button>
              </>
            )}
            {calendar.error && <div style={{ ...S.tip, color: "#C62A40" }}>{calendar.error}</div>}
            <div style={S.tip}>
              Read only, and this device only. The calendars holding clients' legal names
              are never listed or read. Nothing from your calendar is sent to the server
              or shared with the other person.
            </div>
          </div>
        )}

        <div style={S.sub}>
          Ticks, lanes, supplies and anything you added live in this browser only.
          Save a copy somewhere you trust.
        </div>

        {confirmImport ? (
          <>
            <div style={{ ...S.rules, background: "#FFF1F1", borderColor: "#F5B0B0" }}>
              <div style={S.rule}>
                Restoring replaces everything currently on the board with the contents
                of that file. This cannot be undone.
              </div>
            </div>
            <button onClick={doImport} style={S.bigBtn}>Replace the board</button>
            <button onClick={() => setConfirmImport(null)} style={S.textBtn}>Keep what I have</button>
          </>
        ) : (
          <>
            <button onClick={download} style={S.bigBtn}>Save a backup file</button>
            <div style={{ height: 8 }} />
            <button onClick={() => file.current?.click()} style={{ ...S.bigBtn, background: "#fff", color: "#2F2A3D", border: `1.5px solid ${LINE}` }}>
              Restore from a file
            </button>
            <input ref={file} type="file" accept="application/json,.json" onChange={pick} style={{ display: "none" }} />

            <div style={{ borderTop: `1px solid ${LINE}`, marginTop: 20, paddingTop: 16 }}>
              <div style={S.sub}>
                Locking forgets the key on this device. You will need the passcode again.
              </div>
              <button onClick={onLock} style={{ ...S.bigBtn, background: "#C62A40" }}>Lock this device</button>
            </div>

            <button onClick={close} style={S.textBtn}>Close</button>
          </>
        )}
      </div>
    </div>
  );
}
