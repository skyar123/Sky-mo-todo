import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { S, CSS } from "./styles.js";
import { Toast } from "./components/bits.jsx";
import { DayTab } from "./components/DayTab.jsx";
import { FamiliesTab } from "./components/FamiliesTab.jsx";
import { FamilyDetail } from "./components/FamilyDetail.jsx";
import { TextsTab } from "./components/TextsTab.jsx";
import { PrintTab } from "./components/PrintTab.jsx";
import { AddSheet } from "./components/AddSheet.jsx";
import { BackupSheet } from "./components/BackupSheet.jsx";
import { SearchResults, searchCaseload } from "./components/SearchResults.jsx";
import { useBoard } from "./lib/board.js";
import { useSwipe } from "./lib/swipe.js";
import { copyText } from "./lib/clipboard.js";
import { available as storageAvailable } from "./lib/storage.js";
import { resolveToday, addDays, iso, dueInfo } from "./lib/dates.js";
import { visitsOn, nextVisitDay } from "./lib/schedule.js";

const TABS = ["day", "families", "texts", "print"];
const TAB_LABELS = [["day", "Day"], ["families", "Families"], ["texts", "Texts"], ["print", "Print"]];
const LANE_FILTERS = [["all", "All"], ["sky", "Me"], ["mo", "Mo"]];

/** Monday of the week `d` falls in, for the printed header. */
const weekStartOf = (d) => addDays(d, -((d.getDay() + 6) % 7));

export default function App({ caseload, onLock }) {
  const { families } = caseload;
  const today = useMemo(() => resolveToday(), []);
  const board = useBoard(caseload, today);

  const [tab, setTab] = useState("day");
  const [lane, setLane] = useState("all");
  const [openId, setOpenId] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
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
  const reminderDay = useMemo(() => nextVisitDay(families, addDays(today, 1)), [families, today]);
  const unsent = useMemo(() => {
    if (!reminderDay) return [];
    const key = iso(reminderDay);
    return visitsOn(families, reminderDay).filter((c) => c.texts && !board.sent[c.id + key]);
  }, [families, reminderDay, board.sent]);

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
      else if (e.key === "Escape") { setOpenId(null); setSearching(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stepTab]);

  const openFamily = openId ? byId.get(openId) : null;
  const showPrint = tab === "print" && !openFamily && !searching;

  return (
    <div style={S.app} {...swipe}>
      <style>{CSS}</style>

      <header style={S.head} className="noprint">
        <div style={S.headTop}>
          <div style={S.mark}>sky<span style={{ color: "#F2687E" }}>+</span>mo</div>
          <div style={S.headRight}>
            <div style={S.seg}>
              {LANE_FILTERS.map(([k, l]) => (
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
              onClick={() => { setSearching((s) => !s); setOpenId(null); }}
              style={{ ...S.iconBtn, ...(searching ? S.iconBtnOn : {}) }}
              aria-label={searching ? "Close search" : "Search"}
              aria-pressed={searching}
            >
              <span aria-hidden="true">⌕</span>
            </button>
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
                onClick={() => { setTab(k); setOpenId(null); }}
                style={{ ...S.tab, ...(tab === k && !openFamily ? S.tabOn : {}) }}
                aria-current={tab === k && !openFamily ? "page" : undefined}
              >
                {l}
              </button>
            ))}
          </nav>
        )}
      </header>

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

        {!searching && openFamily && (
          <FamilyDetail
            c={openFamily}
            tasks={board.tasks}
            families={families}
            familyById={byId}
            supplies={board.supplies}
            drops={board.drops}
            today={today}
            board={boardWithUndo}
            onFlash={flash}
            onBack={() => setOpenId(null)}
          />
        )}

        {!searching && !openFamily && tab === "day" && (
          <DayTab
            caseload={caseload}
            today={today}
            counts={counts}
            supplies={board.supplies}
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

        {!searching && !openFamily && tab === "families" && (
          <FamiliesTab
            families={families}
            counts={counts}
            supplies={board.supplies}
            onOpenFamily={goFamily}
          />
        )}

        {!searching && !openFamily && tab === "texts" && (
          <TextsTab
            families={families}
            today={today}
            sent={board.sent}
            setSent={board.setSent}
            copy={copy}
            initialDay={reminderDay}
          />
        )}

        {showPrint && (
          <PrintTab
            families={families}
            openTasks={laneTasks}
            supplies={board.supplies}
            today={today}
            weekStart={weekStartOf(today)}
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
          today={today}
          flash={flash}
          storageOk={storageOk}
        />
      )}

      <Toast toast={toast} onAction={runUndo} />
    </div>
  );
}

