import React, { useRef, useState } from "react";
import { S, LINE } from "../styles.js";
import { iso } from "../lib/dates.js";
import { PEOPLE, HANDS, nameOf } from "../lib/identity.js";
import { copyText } from "../lib/clipboard.js";
import { handOff } from "../lib/handoff.js";
import { runningBuild, startAgain } from "../lib/fresh.js";

/* Everything the board remembers lives in one browser. Clearing site data,
   a new phone or a reinstall takes it with it, so a backup is not optional
   housekeeping. The file is written locally and never uploaded. */
/** A text the person holding this phone can send the other, to get them on. */
export function setupMessage(me, them) {
  const url = typeof location !== "undefined" ? `${location.origin}${location.pathname}` : "";
  return [
    `Hi ${them}, it's ${me}. This is the caseload board we're sharing: ${url}`,
    "",
    "1. Open it in Safari on your phone, tap Share, then Add to Home Screen.",
    "2. Open it from your home screen and put in the passcode I gave you.",
    `3. When it asks whose phone it is, tap ${them}.`,
    "",
    "After that, anything either of us ticks or adds shows up on both phones.",
  ].join("\n");
}

export function BackupSheet({ close, exportBlob, importBlob, onLock, who, setWho, hand, setHand, shared, calendar, today, flash, storageOk }) {
  const file = useRef(null);
  const other = who === "mo" ? "sky" : "mo";
  const [confirmImport, setConfirmImport] = useState(null);
  const [showProject, setShowProject] = useState(false);
  const [draftId, setDraftId] = useState("");

  function saveProject() {
    try {
      calendar.useProject(draftId);
      setDraftId("");
      setShowProject(false);
      flash(draftId.trim() ? "Using that Google project" : "Back to the built-in project");
    } catch (err) {
      flash(err.message || "That did not look like a client id");
    }
  }

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

        {/* A board for two that one person uses is a to-do list with extra
            steps. Nothing on it has ever come from the other phone, and the
            fix is a message, not a feature. The passcode is deliberately not
            in it: that one is said out loud. */}
        {shared && who && (
          <div style={{ marginBottom: 18 }}>
            <div style={S.fieldLabel}>Get {nameOf(other)} set up</div>
            <div style={{ ...S.rowWrap, marginTop: 6 }}>
              <button
                onClick={async () => {
                  const ok = await copyText(setupMessage(nameOf(who), nameOf(other)));
                  flash(ok ? `Copied. Paste it into a text to ${nameOf(other)}.` : "Could not copy on this phone");
                }}
                style={S.mini}
              >
                Copy a setup message for {nameOf(other)}
              </button>
            </div>
            <div style={{ ...S.tip, marginTop: 4 }}>
              The link and three steps, ready to text. The passcode is not in it;
              tell {nameOf(other)} that in person.
            </div>
          </div>
        )}

        <div style={{ marginBottom: 18 }}>
          <div style={S.fieldLabel}>Which side the tick boxes sit on</div>
          <div style={{ ...S.rowWrap, marginTop: 6 }}>
            {HANDS.map(([k, l]) => (
              <button
                key={k}
                onClick={() => setHand(k)}
                style={{ ...S.mini, ...(hand === k ? S.miniOn : {}) }}
                aria-pressed={hand === k}
              >
                {l}
              </button>
            ))}
          </div>
          <div style={{ ...S.tip, marginTop: 4 }}>
            Put them under the thumb that holds the phone. This device only.
          </div>
        </div>

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
                {calendar.haveId ? (
                  <button onClick={calendar.connect} style={S.bigBtn}>
                    {calendar.status === "working" ? "Connecting…" : "Connect Google Calendar"}
                  </button>
                ) : (
                  <div style={{ ...S.rules, marginTop: 0 }}>
                    <div style={S.rule}>
                      This needs a client id from a Google Cloud project of your own.
                      Paste it below and the connect button appears.
                    </div>
                  </div>
                )}
              </>
            )}
            {calendar.error && <div style={{ ...S.tip, color: "#C62A40" }}>{calendar.error}</div>}

            {/* Printed rather than hidden: when sign-in is refused, the first
                question is always which id was actually used, and a phone
                running an old bundle answers it differently than the deploy. */}
            <div style={{ ...S.tip, wordBreak: "break-all" }}>
              Using client id <strong>{calendar.clientId || "none set"}</strong>
              {calendar.ownProject ? " (pasted on this device)" : ""}
            </div>

            {showProject || !calendar.haveId || (calendar.error && !calendar.connected) ? (
              <div style={{ marginTop: 10 }}>
                <div style={S.fieldLabel}>Google client id</div>
                <input
                  value={draftId}
                  onChange={(e) => setDraftId(e.target.value)}
                  placeholder={calendar.clientId || "000000000000-xxxx.apps.googleusercontent.com"}
                  aria-label="Google client id"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  style={{ ...S.editInput, fontSize: 12.5 }}
                />
                <div style={S.rowWrap}>
                  <button onClick={saveProject} style={S.mini}>Use this one</button>
                  {calendar.ownProject && (
                    <button
                      onClick={() => { calendar.useProject(""); setDraftId(""); flash("Back to the built-in project"); }}
                      style={S.mini}
                    >
                      Back to default
                    </button>
                  )}
                  {calendar.haveId && (
                    <button onClick={() => { setShowProject(false); setDraftId(""); }} style={S.mini}>Cancel</button>
                  )}
                </div>
                <div style={S.tip}>
                  From Google Cloud Console, APIs &amp; Services, Credentials: a Web
                  application OAuth client, with this site listed under Authorised
                  JavaScript origins and its consent screen set to External. The id is
                  public, not a password, and it is only saved on this device.
                </div>
              </div>
            ) : (
              <button onClick={() => setShowProject(true)} style={S.textBtn}>
                {calendar.ownProject ? "Change the Google project" : "Use a different Google project"}
              </button>
            )}

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
              <div style={S.fieldLabel}>This device is running build {runningBuild()}</div>
              <div style={{ ...S.tip, marginTop: 2 }}>
                If something here looks older than it should, the phone is still on a
                previous version. This drops the stored copy and loads the current one.
                Ticks and notes are on the shared board and are not touched.
              </div>
              <button
                onClick={startAgain}
                style={{ ...S.bigBtn, background: "#fff", color: "#2F2A3D", border: `1.5px solid ${LINE}` }}
                aria-label="Reload the latest version"
              >
                Get the latest version
              </button>
            </div>

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
