export const F = 'ui-rounded, "SF Pro Rounded", "Hiragino Maru Gothic ProN", "Segoe UI", system-ui, sans-serif';
export const INK = "#2F2A3D";
export const PAPER = "#FFFDF9";
export const LINE = "#EDE9F3";
export const HOT = "#C62A40";
export const WARN = "#F0C24A";

export const S = {
  app: { fontFamily: F, color: INK, background: PAPER, minHeight: "100vh", paddingBottom: 90 },
  head: { position: "sticky", top: 0, zIndex: 20, background: PAPER, paddingTop: 10, borderBottom: `1px solid ${LINE}` },
  headTop: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "0 16px 10px" },
  mark: { fontSize: 20, fontWeight: 800, letterSpacing: -0.5 },
  headRight: { display: "flex", alignItems: "center", gap: 8 },
  seg: { display: "flex", background: "#F4F1F9", borderRadius: 99, padding: 2 },
  segBtn: { fontFamily: F, fontSize: 12, fontWeight: 600, padding: "7px 12px", borderRadius: 99, border: "none", background: "transparent", color: INK, opacity: 0.55, cursor: "pointer" },
  segOn: { background: "#fff", opacity: 1, boxShadow: "0 1px 3px rgba(47,42,61,.12)" },
  iconBtn: { width: 34, height: 34, borderRadius: 99, border: `1.5px solid ${LINE}`, background: "#fff", color: INK, fontSize: 15, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0, flexShrink: 0 },
  iconBtnOn: { background: INK, color: "#fff", borderColor: INK },
  tabs: { display: "flex", gap: 20, padding: "0 16px" },
  tab: { fontFamily: F, fontSize: 13.5, fontWeight: 600, padding: "0 0 10px", border: "none", background: "transparent", color: INK, opacity: 0.45, cursor: "pointer", borderBottom: "2px solid transparent" },
  tabOn: { opacity: 1, borderBottomColor: INK },

  searchWrap: { padding: "0 16px 10px" },
  search: { width: "100%", fontFamily: F, fontSize: 16, padding: "10px 12px", borderRadius: 11, border: `1.5px solid ${LINE}`, background: "#fff", color: INK },

  /* The bottom padding keeps the last row clear of the floating add button,
     which is fixed to that corner and otherwise sits on top of it. On a long
     list the thing you cannot tap is always the last one. */
  main: { padding: "18px 16px 96px", minHeight: "70vh" },
  h1: { fontSize: 26, fontWeight: 800, letterSpacing: -0.6, lineHeight: 1.1 },
  h2: { fontSize: 12.5, fontWeight: 700, opacity: 0.5, margin: "26px 0 8px", textTransform: "none" },
  sub: { fontSize: 13, opacity: 0.6, marginTop: 4, marginBottom: 16, lineHeight: 1.5 },
  /* The date over a day's visits further down the week. Quieter than a
     section heading, because the section is the week and these are its days. */
  dayLabel: { fontSize: 11.5, fontWeight: 700, opacity: 0.4, margin: "14px 0 2px" },

  visit: { display: "flex", alignItems: "center", gap: 10, width: "100%", minHeight: 48, padding: "13px 2px", background: "transparent", border: "none", borderBottom: `1px solid ${LINE}`, fontFamily: F, color: INK, cursor: "pointer", textAlign: "left" },
  visitTime: { fontSize: 13, fontWeight: 700, width: 44, opacity: 0.75, flexShrink: 0 },
  dot: { width: 10, height: 10, borderRadius: 99, flexShrink: 0, display: "inline-block" },
  visitName: { fontSize: 16, fontWeight: 700, display: "block" },
  supLine: { fontSize: 11.5, opacity: 0.6, display: "block", marginTop: 2 },
  visitCount: { fontSize: 11.5, fontWeight: 700, background: "#F4F1F9", borderRadius: 99, padding: "3px 8px" },
  visitFlag: { fontSize: 11.5, fontWeight: 800, background: HOT, color: "#fff", borderRadius: 99, padding: "3px 8px" },
  blockRow: { display: "flex", gap: 10, alignItems: "center", padding: "13px 2px", borderBottom: `1px solid ${LINE}`, fontSize: 14.5, opacity: 0.65 },
  blockTime: { fontSize: 13, fontWeight: 700, width: 44 },

  nudge: { display: "block", width: "auto", textAlign: "left", marginTop: 22, padding: "14px 15px", borderRadius: 16, border: "1.5px solid #FFD9C2", background: "#FFF6EF", fontFamily: F, color: INK, cursor: "pointer" },
  nudgeTitle: { fontSize: 15, fontWeight: 700 },
  nudgeSub: { fontSize: 12.5, opacity: 0.65, marginTop: 3, lineHeight: 1.45 },

  dueRow: { display: "flex", alignItems: "flex-start", gap: 10, width: "100%", minHeight: 44, padding: "11px 2px", background: "transparent", border: "none", borderBottom: `1px solid ${LINE}`, fontFamily: F, color: INK, cursor: "pointer", textAlign: "left" },
  dueText: { flex: 1, fontSize: 13.5, lineHeight: 1.45 },
  pill: { fontSize: 10.5, fontWeight: 800, padding: "3px 8px", borderRadius: 99, whiteSpace: "nowrap", flexShrink: 0 },

  famNav: { display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 12 },
  back: { background: "transparent", border: "none", fontFamily: F, fontSize: 14.5, color: INK, opacity: 0.55, padding: "4px 0 12px", cursor: "pointer" },
  swipeHint: { fontSize: 11, opacity: 0.4, paddingBottom: 12 },
  heroRow: { display: "flex", gap: 11, alignItems: "flex-start", marginBottom: 12 },

  fold: { borderTop: `1px solid ${LINE}` },
  foldHead: { display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", minHeight: 46, padding: "15px 2px 11px", background: "transparent", border: "none", fontFamily: F, fontSize: 14.5, fontWeight: 700, color: INK, cursor: "pointer", textAlign: "left" },
  fieldLabel: { fontSize: 11.5, fontWeight: 700, opacity: 0.5, marginBottom: 3 },
  fieldBody: { fontSize: 14, lineHeight: 1.55 },
  kindHead: { fontSize: 11.5, fontWeight: 700, opacity: 0.45, margin: "10px 0 5px" },
  watchRow: { fontSize: 13.5, lineHeight: 1.55, paddingLeft: 12, borderLeft: `2px solid ${LINE}`, marginBottom: 10 },
  dropNote: { fontSize: 11.5, opacity: 0.55 },

  task: { borderBottom: `1px solid ${LINE}` },
  taskTop: { display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 0" },
  box: { width: 22, height: 22, minWidth: 22, borderRadius: 6, border: "2px solid", background: "transparent", color: "#fff", fontSize: 12, fontWeight: 900, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0, marginTop: 1 },
  taskText: { flex: 1, textAlign: "left", background: "transparent", border: "none", fontFamily: F, fontSize: 13.5, lineHeight: 1.45, color: INK, cursor: "pointer", padding: "2px 0" },
  taskBody: { padding: "0 0 12px 32px" },
  /* A task that arrived from the other person, said on the row itself: in a
     list of forty, a lane chip is not something anyone reads. */
  handed: { margin: "0 0 10px 32px", padding: "6px 9px", borderLeft: "3px solid #B9AECE", background: "#F4F1F9", borderRadius: 4, fontSize: 12, lineHeight: 1.45 },
  note: { fontSize: 12.5, opacity: 0.68, lineHeight: 1.5, marginBottom: 9 },

  editLabel: { fontSize: 10.5, fontWeight: 700, opacity: 0.45, margin: "8px 0 3px" },
  editInput: { width: "100%", fontFamily: F, fontSize: 16, lineHeight: 1.4, padding: "9px 10px", borderRadius: 10, border: `1.5px solid ${LINE}`, background: "#fff", color: INK },
  editArea: { width: "100%", fontFamily: F, fontSize: 16, lineHeight: 1.5, padding: "9px 10px", borderRadius: 10, border: `1.5px solid ${LINE}`, background: "#fff", color: INK, resize: "vertical" },
  editRow: { display: "flex", gap: 6, alignItems: "center" },
  quickAdd: { display: "flex", gap: 6, alignItems: "center", padding: "10px 0 4px" },

  rowWrap: { display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 12 },
  mini: { fontFamily: F, fontSize: 12, fontWeight: 600, minHeight: 32, padding: "7px 12px", borderRadius: 99, border: `1.5px solid ${LINE}`, background: "#fff", color: INK, cursor: "pointer" },
  miniOn: { background: INK, color: "#fff", borderColor: INK },
  miniOn2: { fontFamily: F, fontSize: 13, fontWeight: 700, padding: "10px 20px", borderRadius: 99, border: "none", background: INK, color: "#fff", cursor: "pointer" },

  seg2: { display: "flex", gap: 4, background: "#F4F1F9", borderRadius: 12, padding: 3, margin: "14px 0" },
  seg2Btn: { flex: 1, fontFamily: F, fontSize: 13, fontWeight: 600, padding: "9px 0", borderRadius: 10, border: "none", background: "transparent", color: INK, opacity: 0.55, cursor: "pointer" },
  seg2On: { background: "#fff", opacity: 1, boxShadow: "0 1px 3px rgba(47,42,61,.12)" },

  msg: { borderTop: `1px solid ${LINE}`, paddingTop: 13, marginBottom: 4 },
  msgHead: { display: "flex", alignItems: "center", gap: 8, marginBottom: 8, fontSize: 14.5 },
  bubble: { background: "#F4F1F9", borderRadius: "16px 16px 16px 5px", padding: "13px 15px", fontSize: 14.5, lineHeight: 1.6, marginBottom: 12 },

  shareRow: { display: "block", width: "100%", textAlign: "left", padding: "14px 2px", background: "transparent", border: "none", borderBottom: `1px solid ${LINE}`, fontFamily: F, color: INK, cursor: "pointer" },
  linkRow: { borderTop: `1px solid ${LINE}`, padding: "11px 0" },
  linkUrl: { fontSize: 11, opacity: 0.5, wordBreak: "break-all", margin: "3px 0 8px" },
  tip: { fontSize: 12, opacity: 0.55, marginTop: 18, lineHeight: 1.5 },
  noteRow: { display: "flex", gap: 10, alignItems: "center", padding: "12px 0", borderBottom: `1px solid ${LINE}` },

  rules: { background: "#FFFBEE", border: "1.5px solid #F5E3B0", borderRadius: 14, padding: "11px 13px", marginBottom: 14 },
  rule: { fontSize: 12, lineHeight: 1.6, opacity: 0.85 },

  textarea: { width: "100%", fontFamily: F, fontSize: 16, lineHeight: 1.5, padding: 12, borderRadius: 13, border: `1.5px solid ${LINE}`, background: "#fff", color: INK, resize: "vertical", marginBottom: 12 },
  select: { flex: 1, minWidth: 130, fontFamily: F, fontSize: 16, padding: "10px", borderRadius: 11, border: `1.5px solid ${LINE}`, background: "#fff", color: INK },
  bigBtn: { width: "100%", padding: "14px 0", borderRadius: 13, border: "none", background: INK, color: "#fff", fontFamily: F, fontSize: 15, fontWeight: 700, cursor: "pointer" },
  textBtn: { width: "100%", padding: "12px 0", background: "transparent", border: "none", fontFamily: F, fontSize: 14, color: INK, opacity: 0.55, cursor: "pointer" },

  fab: { position: "fixed", right: 18, bottom: 24, width: 56, height: 56, borderRadius: 99, border: "none", background: INK, color: "#fff", fontSize: 28, lineHeight: 1, fontFamily: F, cursor: "pointer", boxShadow: "0 6px 18px rgba(47,42,61,.28)", zIndex: 30 },
  scrim: { position: "fixed", inset: 0, background: "rgba(47,42,61,.35)", zIndex: 40, display: "flex", alignItems: "flex-end" },
  sheetUp: { background: PAPER, width: "100%", borderRadius: "22px 22px 0 0", padding: "20px 16px 22px", maxHeight: "88vh", overflowY: "auto" },

  sheet: { background: "#fff", color: "#000", padding: "18px 16px", borderRadius: 8, marginTop: 16, border: "1px solid #ddd", fontFamily: "Calibri, Carlito, system-ui, sans-serif" },
  sheetHead: { borderBottom: "2px solid #000", paddingBottom: 6, marginBottom: 13 },
  sheetTitle: { fontSize: 18, fontWeight: 800 },
  sheetSub: { fontSize: 11, marginTop: 2 },
  sheetDay: { marginBottom: 14, breakInside: "avoid" },
  sheetDayName: { fontSize: 14, fontWeight: 800, borderBottom: "1px solid #000", marginBottom: 6 },
  sheetC: { marginBottom: 9, breakInside: "avoid" },
  sheetCName: { fontSize: 12.5, fontWeight: 700, marginBottom: 3 },
  sheetRow: { display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, lineHeight: 1.6, marginBottom: 2, paddingLeft: 4 },
  sheetBox: { width: 13, height: 13, minWidth: 13, border: "1.5px solid #000", marginTop: 3, display: "inline-block" },

  empty: { fontSize: 13.5, opacity: 0.55, padding: "18px 2px", lineHeight: 1.5 },
  toast: { position: "fixed", left: "50%", bottom: 92, transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 12, background: INK, color: "#fff", fontFamily: F, fontSize: 13, padding: "10px 18px", borderRadius: 99, zIndex: 60, maxWidth: "90vw" },
  toastBtn: { background: "transparent", border: "none", color: "#FFD9C2", fontFamily: F, fontSize: 13, fontWeight: 700, cursor: "pointer", padding: 0 },

  lockWrap: { fontFamily: F, color: INK, background: PAPER, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 },
  lockCard: { width: "100%", maxWidth: 330, textAlign: "center" },
  lockMark: { fontSize: 30, fontWeight: 800, letterSpacing: -1, marginBottom: 6 },
  lockSub: { fontSize: 13.5, opacity: 0.6, marginBottom: 22, lineHeight: 1.5 },
  lockInput: { width: "100%", fontFamily: F, fontSize: 20, textAlign: "center", letterSpacing: 3, padding: "13px 12px", borderRadius: 13, border: `1.5px solid ${LINE}`, background: "#fff", color: INK, marginBottom: 12 },
  lockErr: { fontSize: 13, color: HOT, fontWeight: 600, marginBottom: 12, minHeight: 18 },
  lockRow: { display: "flex", alignItems: "center", justifyContent: "center", gap: 7, fontSize: 12.5, opacity: 0.65, marginTop: 14 },
};

export const CSS = `
  * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
  body { margin: 0; background: ${PAPER}; }

  /* Nothing may push the page sideways. A phone that scrolls horizontally
     cuts the right-hand end off every line, and the line is the task. */
  html, body { max-width: 100%; overflow-x: hidden; }

  /* Every control on a phone is operated by a thumb, which is about 44px
     across. Several here are drawn at 22. The drawing stays as it is and the
     touch area grows around it, so nothing moves and everything is hittable. */
  [role="checkbox"], .tap { position: relative; }
  [role="checkbox"]::after, .tap::after {
    content: ""; position: absolute; top: 50%; left: 50%;
    width: 44px; height: 44px; transform: translate(-50%, -50%);
  }

  /* Which side the checkbox sits on. A right thumb reaches the right edge and
     struggles at the left, and half the world is the other way round, so it
     is a setting rather than a guess. */
  [data-hand="right"] .handed { flex-direction: row-reverse; }
  [data-hand="right"] .handed-body { padding-left: 0; padding-right: 32px; }
  button:focus-visible, textarea:focus-visible, select:focus-visible, input:focus-visible {
    outline: 3px solid #5C6BD8; outline-offset: 2px;
  }
  .sr-only {
    position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
    overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
  }
  @media print {
    @page { size: letter; margin: 14mm; }
    html, body { background: #fff !important; }
    .noprint { display: none !important; }
    .sheet { border: none !important; border-radius: 0 !important; padding: 0 !important; margin: 0 !important; }
  }
  @media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
`;
