import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { S, CSS, LINE, HOT } from "./styles.js";
import { Toast } from "./components/bits.jsx";
import { DayTab } from "./components/DayTab.jsx";
import { FamiliesTab } from "./components/FamiliesTab.jsx";
import { FamilyDetail } from "./components/FamilyDetail.jsx";
import { LooseTasks } from "./components/LooseTasks.jsx";
import { WeekTab } from "./components/WeekTab.jsx";
import { TextsTab } from "./components/TextsTab.jsx";
import { PrintTab } from "./components/PrintTab.jsx";
import { AddSheet } from "./components/AddSheet.jsx";
import { BackupSheet } from "./components/BackupSheet.jsx";
import { SearchResults, searchCaseload } from "./components/SearchResults.jsx";
import { TeamingTab } from "./components/TeamingTab.jsx";
import { useBoard } from "./lib/board.js";
import { useSwipe } from "./lib/swipe.js";
import { copyText } from "./lib/clipboard.js";
import { available as storageAvailable } from "./lib/storage.js";
import { readWho, writeWho, laneLabels, PEOPLE, readSeenAt, writeSeenAt, changesFromOther, nameOf, sourceOf, readHand, writeHand } from "./lib/identity.js";
import { resolveToday, addDays, iso, dueInfo } from "./lib/dates.js";
import { liveAgendaFor, visitsToText, upcomingTextDays } from "./lib/schedule.js";
import { useCalendar } from "./lib/useCalendar.js";
import { detectFamily } from "./lib/parse.js";

const TABS = ["day", "families", "week", "texts", "print"];
const TAB_LABELS = [["day", "Day"], ["families", "Families"], ["week", "Week"], ["texts", "Texts"], ["print", "Print"]];

/* How the sharing state reads in the header. Deliberately quiet: this only
   needs attention when it is failing. */
const SYNC = {
  idle:     { mark: "✓", color: "#5FBF77", label: "Shared and up to date" },
  syncing:  { mark: "↻", color: "#B9AECE", label: "Syncing" },
  retrying: { mark: "↻", color: "#B9AECE", label: "Trying again in a moment" },
  offline:  { mark: "○", color: "#B9AECE", label: "Offline. Your work is saved on this phone and will sync when you are back" },
  error:    { mark: "!", color: HOT,       label: "Cannot reach the shared board. Your work is saved on this phone. Tap to try again" },
  holding:  { mark: "!", color: HOT,       label: "Waiting to know whose phone this is before sending anything" },
  off:      { mark: "·", color: "#B9AECE", label: "Not shared" },
};

/** Monday of the week `d` falls in, for the printed header. */
const weekStartOf = (d) => addDays(d, -((d.getDay() + 6) % 7));

export default function App({ caseload, onLock, crypto }) {
  const { families } = caseload;
  const today = useMemo(() => resolveToday(), []);

  /* Declared before useBoard: the board stamps changes with whoever is holding
     the device, so it needs this value on the first render. */
  const [who, setWho] = useState(() => readWho());
  const [hand, setHand] = useState(() => readHand());
  const [seenAt, setSeenAt] = useState(() => readSeenAt());

  const board = useBoard(caseload, today, crypto, who);
  const calendar = useCalendar(today);

  const [tab, setTab] = useState("day");
  const [lane, setLane] = useState("all");
  const [openId, setOpenId] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [teamingOpen, setTeamingOpen] = useState(false);
  const [looseOpen, setLooseOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const undoRef = useRef(null);
  const storageOk = useMemo(() => storageAvailable(), []);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const flash = useCallback((msg, action) => {
    clearTimeout(toastTimer.current);
    setToast({ msg, actionLabel: action?.label });
    undoRef.current = action?.run || null;
    toastTimer.current = setTimeout(() => setToast(null), action ? 5000 : 1800);
  }, []);

  const copy = useCallback(
    async (text, msg) => {
      const ok = await copyText(text);
      flash(ok ? msg || "Copied" : "Press and hold the text to copy");
    },
    [flash]
  );

  /* Delete is one tap on a small target, so it always comes with a way back. */
  const removeWithUndo = useCallback(
    (id) => {
      const undo = board.remove(id);
      flash("Deleted", { label: "Undo", run: undo });
    },
    [board, flash]
  );

  const runUndo = useCallback(() => {
    undoRef.current?.();
    undoRef.current = null;
    clearTimeout(toastTimer.current);
    setToast(null);
  }, []);

  const boardWithUndo = useMemo(() => ({ ...board, removeWithUndo }), [board, removeWithUndo]);

  const inLane = useCallback((t) => lane === "all" || t.lane === lane || t.lane === "both", [lane]);
  const laneTasks = useMemo(() => board.openTasks.filter(inLane), [board.openTasks, inLane]);

  /* Per-family open and overdue counts, computed once per change. */
  const counts = useMemo(() => {
    const out = {};
    for (const t of laneTasks) {
      if (!t.client) continue;
      const c = (out[t.client] = out[t.client] || { open: 0, overdue: 0 });
      c.open += 1;
      const d = dueInfo(t.due, today);
      if (d?.days < 0) c.overdue += 1;
    }
    return out;
  }, [laneTasks, today]);

  const byId = useMemo(() => new Map(families.map((c) => [c.id, c])), [families]);

  /* Open items belonging to no family. They need a door of their own, or
     taking one off the teaming list hides it with no way back. */
  const looseCount = useMemo(() => laneTasks.filter((t) => !t.client).length, [laneTasks]);

  /* The standing meeting you turn up to with a list. Found by label rather
     than by weekday, so moving it does not orphan the agenda. */
  const teamingBlock = useMemo(
    () => caseload.blocks.find((b) => /teaming/i.test(b.label)) || null,
    [caseload.blocks]
  );
  const isTeamingBlock = useCallback(
    (item) => item.kind === "block" && !!teamingBlock && item.label === teamingBlock.label,
    [teamingBlock]
  );
  /* Today, as the calendar has it. Null when this device is not connected. */
  const liveToday = useMemo(
    () => (calendar.events ? liveAgendaFor(calendar.events, today, families, detectFamily) : null),
    [calendar.events, today, families]
  );

  const agendaCount = useMemo(
    () => board.openTasks.filter((t) => t.agenda).length,
    [board.openTasks]
  );

  /* What the other person did while this device was not looking. Reads all
     tasks, not just open ones: "Mo ticked that off" is the single most useful
     thing to know, and a completed task is no longer in the open list. */
  const theirChanges = useMemo(
    () => changesFromOther(board.tasks, who, seenAt),
    [board.tasks, who, seenAt]
  );
  const changedFamilies = useMemo(
    () => new Set(theirChanges.map((t) => t.client).filter(Boolean)),
    [theirChanges]
  );
  const catchUp = useCallback(() => {
    const now = Date.now();
    writeSeenAt(now);
    setSeenAt(now);
  }, []);

  const soon = useMemo(
    () =>
      laneTasks
        .filter((t) => {
          const d = dueInfo(t.due, today);
          return d && d.days <= 7;
        })
        .sort((a, b) => a.due.localeCompare(b.due))
        .map((t) => ({ task: t, family: t.client ? byId.get(t.client) : null })),
    [laneTasks, today, byId]
  );

  /* Reminders go out the night before. If tomorrow is a Saturday, the next
     day that actually has visits is the useful thing to show. */
  /* The day to text about, and who still needs one. Both read the calendar
     where it has been read, so the nudge on the day view and the messages in
     the texts tab can never name different times. */
  const reminderDay = useMemo(
    () => upcomingTextDays(families, addDays(today, 1), calendar.events, detectFamily, 1)[0] || null,
    [families, today, calendar.events]
  );
  const unsent = useMemo(() => {
    if (!reminderDay) return [];
    const key = iso(reminderDay);
    return visitsToText(families, reminderDay, calendar.events, detectFamily)
      .filter((v) => !board.sent[v.c.id + key]);
  }, [families, reminderDay, calendar.events, board.sent]);

  const searchResult = useMemo(
    () => (searching ? searchCaseload(families, board.tasks, query) : null),
    [searching, families, board.tasks, query]
  );

  const goFamily = useCallback((id) => {
    if (!id) return;
    setOpenId(id);
    setSearching(false);
  }, []);

  const stepTab = useCallback((n) => {
    setTab((cur) => TABS[(TABS.indexOf(cur) + n + TABS.length) % TABS.length]);
  }, []);

  const stepFamily = useCallback(
    (n) => {
      const i = families.findIndex((c) => c.id === openId);
      if (i < 0) return;
      setOpenId(families[(i + n + families.length) % families.length].id);
    },
    [families, openId]
  );

  const swipe = useSwipe(
    () => (openId ? stepFamily(1) : stepTab(1)),
    () => (openId ? stepFamily(-1) : stepTab(-1))
  );

  /* Desktop: arrow keys move between tabs when nothing is focused. */
  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement;
      if (el && el.matches("input, textarea, select")) return;
      if (e.key === "ArrowRight") stepTab(1);
      else if (e.key === "ArrowLeft") stepTab(-1);
      else if (e.key === "Escape") { setOpenId(null); setSearching(false); setTeamingOpen(false); setLooseOpen(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stepTab]);

  const openFamily = openId ? byId.get(openId) : null;
  const showPrint = tab === "print" && !openFamily && !searching && !teamingOpen && !looseOpen;

  return (
    <div style={S.app} data-hand={hand} {...swipe}>
      <style>{CSS}</style>

      <header style={S.head} className="noprint">
        <div style={S.headTop}>
          <div style={S.mark}>sky<span style={{ color: "#F2687E" }}>+</span>mo</div>
          <div style={S.headRight}>
            <div style={S.seg}>
              {laneLabels(who).map(([k, l]) => (
                <button
                  key={k}
                  onClick={() => setLane(k)}
                  style={{ ...S.segBtn, ...(lane === k ? S.segOn : {}) }}
                  aria-pressed={lane === k}
                >
                  {l}
                </button>
              ))}
            </div>
            <button
              onClick={() => { setSearching((s) => !s); setOpenId(null); setTeamingOpen(false); setLooseOpen(false); }}
              style={{ ...S.iconBtn, ...(searching ? S.iconBtnOn : {}) }}
              aria-label={searching ? "Close search" : "Search"}
              aria-pressed={searching}
            >
              <span aria-hidden="true">⌕</span>
            </button>
            {board.shared && (
              <button
                onClick={() => {
                  /* Whatever it says, the first thing worth knowing is that
                     nothing has been lost. */
                  flash(SYNC[board.syncState]?.label || "Syncing");
                  board.syncNow();
                }}
                style={{ ...S.iconBtn, borderColor: SYNC[board.syncState]?.color || LINE }}
                aria-label={`Sharing: ${SYNC[board.syncState]?.label || "off"}. Tap to sync now.`}
                title={SYNC[board.syncState]?.label}
              >
                <span aria-hidden="true" style={{ fontSize: 13, color: SYNC[board.syncState]?.color }}>
                  {SYNC[board.syncState]?.mark || "·"}
                </span>
              </button>
            )}
            <button
              onClick={() => setBackupOpen(true)}
              style={S.iconBtn}
              aria-label="Backup and lock"
            >
              <span aria-hidden="true">⋯</span>
            </button>
          </div>
        </div>

        {searching && (
          <div style={S.searchWrap}>
            <label className="sr-only" htmlFor="q">Search families and tasks</label>
            <input
              id="q"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Family, child, task, a phrase in a note…"
              style={S.search}
              data-noswipe
            />
          </div>
        )}

        {!searching && (
          <nav style={S.tabs}>
            {TAB_LABELS.map(([k, l]) => (
              <button
                key={k}
                onClick={() => { setTab(k); setOpenId(null); setTeamingOpen(false); setLooseOpen(false); }}
                style={{ ...S.tab, ...(tab === k && !openFamily && !teamingOpen && !looseOpen ? S.tabOn : {}) }}
                aria-current={tab === k && !openFamily && !teamingOpen && !looseOpen ? "page" : undefined}
              >
                {l}
              </button>
            ))}
          </nav>
        )}
      </header>

      {board.shared && !who && (
        <div style={{ ...S.nudge, margin: "18px 16px 0", background: "#F4F1F9", borderColor: LINE }} className="noprint">
          <div style={S.nudgeTitle}>Whose phone is this?</div>
          <div style={S.nudgeSub}>
            Until this is answered, nothing you change here is sent to the other
            person. It is saved on this phone and goes up the moment you tap.
          </div>
          <div style={{ ...S.rowWrap, marginTop: 10, marginBottom: 0 }}>
            {PEOPLE.map(([k, l]) => (
              <button
                key={k}
                onClick={(e) => { e.stopPropagation(); writeWho(k); setWho(k); }}
                style={{ ...S.mini, ...S.miniOn }}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
      )}

      <main style={S.main} className={showPrint ? "" : "noprint"}>
        {searching && searchResult && (
          <SearchResults
            result={searchResult}
            today={today}
            counts={counts}
            supplies={board.supplies}
            onOpenFamily={goFamily}
            onToggle={board.toggle}
          />
        )}
        {searching && !searchResult && (
          <div style={S.empty}>Type at least two letters.</div>
        )}

        {!searching && looseOpen && (
          <LooseTasks
            tasks={board.tasks}
            families={families}
            familyById={byId}
            today={today}
            board={boardWithUndo}
            who={who}
            onFlash={flash}
            onBack={() => setLooseOpen(false)}
          />
        )}

        {!searching && !looseOpen && teamingOpen && (
          <>
            <div style={S.famNav}>
              <button onClick={() => setTeamingOpen(false)} style={S.back}>‹ back</button>
            </div>
            <TeamingTab
              block={teamingBlock}
              families={families}
              familyById={byId}
              tasks={board.tasks}
              today={today}
              board={boardWithUndo}
              onOpenFamily={(id) => { setTeamingOpen(false); goFamily(id); }}
              onFlash={flash}
            />
          </>
        )}

        {!searching && !teamingOpen && !looseOpen && openFamily && (
          <FamilyDetail
            c={openFamily}
            tasks={board.tasks}
            families={families}
            familyById={byId}
            supplies={board.supplies}
            drops={board.drops}
            today={today}
            board={boardWithUndo}
            who={who}
            onFlash={flash}
            onBack={() => setOpenId(null)}
          />
        )}

        {!searching && !teamingOpen && !looseOpen && !openFamily && tab === "day" && (
          <DayTab
            caseload={caseload}
            today={today}
            counts={counts}
            supplies={board.supplies}
            changedFamilies={changedFamilies}
            theirChanges={theirChanges}
            theirName={sourceOf(theirChanges, who) || nameOf(who === "sky" ? "mo" : "sky")}
            agendaCount={agendaCount}
            isTeamingBlock={isTeamingBlock}
            teamingBlock={teamingBlock}
            live={liveToday}
            liveAsOf={calendar.fetchedAt}
            calendarName={calendar.calendar?.summary || null}
            events={calendar.events}
            detectFamily={detectFamily}
            onOpenTeaming={() => { setTeamingOpen(true); setOpenId(null); }}
            onCatchUp={catchUp}
            soon={soon}
            openCount={laneTasks.length}
            unsent={unsent}
            reminderDay={reminderDay}
            familyById={byId}
            onFlash={flash}
            onOpenFamily={goFamily}
            onGoTexts={() => setTab("texts")}
          />
        )}

        {!searching && !teamingOpen && !looseOpen && !openFamily && tab === "families" && (
          <FamiliesTab
            families={families}
            counts={counts}
            supplies={board.supplies}
            changedFamilies={changedFamilies}
            loose={looseCount}
            onOpenFamily={goFamily}
            onOpenLoose={() => { setLooseOpen(true); setOpenId(null); }}
          />
        )}

        {!searching && !teamingOpen && !looseOpen && !openFamily && tab === "week" && (
          <WeekTab
            tasks={board.tasks}
            families={families}
            today={today}
            onOpenFamily={goFamily}
          />
        )}

        {!searching && !teamingOpen && !looseOpen && !openFamily && tab === "texts" && (
          <TextsTab
            families={families}
            today={today}
            sent={board.sent}
            setSent={board.setSent}
            copy={copy}
            initialDay={reminderDay}
            events={calendar.events}
            detectFamily={detectFamily}
            me={who || "sky"}
            onFlash={flash}
          />
        )}

        {showPrint && (
          <PrintTab
            families={families}
            openTasks={laneTasks}
            supplies={board.supplies}
            today={today}
            weekStart={weekStartOf(today)}
            me={who}
            teamingLabel={teamingBlock ? `To bring up: ${teamingBlock.label.split(",")[0]}` : null}
            flash={flash}
          />
        )}
      </main>

      {tab !== "print" && !searching && (
        <button onClick={() => setAddOpen(true)} style={S.fab} className="noprint" aria-label="Add tasks">
          <span aria-hidden="true">+</span>
        </button>
      )}

      {addOpen && (
        <AddSheet
          families={families}
          today={today}
          close={() => setAddOpen(false)}
          add={board.add}
          flash={flash}
        />
      )}

      {backupOpen && (
        <BackupSheet
          close={() => setBackupOpen(false)}
          exportBlob={board.exportBlob}
          importBlob={board.importBlob}
          onLock={onLock}
          shared={board.shared}
          calendar={calendar}
          who={who}
          setWho={(k) => { writeWho(k); setWho(k); }}
          hand={hand}
          setHand={(h) => { writeHand(h); setHand(h); }}
          today={today}
          flash={flash}
          storageOk={storageOk}
        />
      )}

      <Toast toast={toast} onAction={runUndo} />
    </div>
  );
}

