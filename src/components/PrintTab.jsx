import React, { useState } from "react";
import { S } from "../styles.js";
import { LONG, fmtDay, dueInfo } from "../lib/dates.js";
import { isScheduled, timeKey } from "../lib/schedule.js";

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
/* Two people print this now, so the buttons follow whoever is holding the
   phone while the printed title always names the actual person. A sheet that
   says "My list" on paper tells the other one nothing. */
function whoOptions(me) {
  if (me === "mo") return [["mo", "My list"], ["sky", "Skylar's list"], ["all", "Everything"]];
  if (me === "sky") return [["sky", "My list"], ["mo", "Mo's list"], ["all", "Everything"]];
  return [["sky", "Skylar's list"], ["mo", "Mo's list"], ["all", "Everything"]];
}

export function PrintTab({ families, openTasks, supplies, today, weekStart, me, flash }) {
  const [who, setWho] = useState(() => (me === "mo" ? "mo" : "sky"));
  const rows = openTasks.filter((x) => who === "all" || x.lane === who || x.lane === "both");

  const byDay = {};
  for (const c of families) {
    const mine = rows.filter((x) => x.client === c.id);
    if (!mine.length) continue;
    const key = isScheduled(c) ? c.day : 0;
    (byDay[key] = byDay[key] || []).push({ c, mine });
  }
  for (const k of Object.keys(byDay)) {
    byDay[k].sort((a, b) => timeKey(a.c.time) - timeKey(b.c.time));
  }
  const loose = rows.filter((x) => !x.client);
  const title = who === "mo" ? "Mo" : who === "sky" ? "Skylar" : "Skylar and Mo";
  const printedFor = who === "all" ? "Both lists" : `${title}'s list`;

  return (
    <>
      <div className="noprint">
        <div style={S.h1}>Print</div>
        <div style={S.sub}>Plain paper, big boxes, grouped by the day you see each family.</div>
        <div style={S.rowWrap}>
          {whoOptions(me).map(([k, l]) => (
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
        <button
          onClick={() => { try { window.print(); } catch { flash("Use share, then Print"); } }}
          style={S.bigBtn}
        >
          Print this
        </button>
        <div style={{ ...S.sub, marginTop: 10 }}>
          If nothing happens, use the share button and choose Print.
        </div>
      </div>

      <div className="sheet" style={S.sheet}>
        <div style={S.sheetHead}>
          <div style={S.sheetTitle}>{title} · week of {fmtDay(weekStart)}</div>
          <div style={S.sheetSub}>
            Child First · {printedFor} · {rows.length + loose.length === 0 ? "nothing open" : `${rows.length} open`}
          </div>
        </div>

        {DAY_ORDER.map((d) => {
          const g = byDay[d] || [];
          if (!g.length) return null;
          return (
            <div key={d} style={S.sheetDay}>
              <div style={S.sheetDayName}>{d === 0 ? "Not scheduled" : LONG[d]}</div>
              {g.map(({ c, mine }) => {
                const sup = supplies[c.id] || [];
                return (
                  <div key={c.id} style={S.sheetC}>
                    <div style={S.sheetCName}>
                      {c.name}
                      {c.time ? `, ${c.time}` : ""}
                      {sup.length ? ` — bring ${sup.join(", ").toLowerCase()}` : ""}
                    </div>
                    {mine.map((x) => {
                      const di = dueInfo(x.due, today);
                      return (
                        <div key={x.id} style={S.sheetRow}>
                          <span style={S.sheetBox} />
                          <span>
                            {x.text}
                            {di ? `  (${di.days < 0 ? "OVERDUE" : "due"} ${di.label})` : ""}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          );
        })}

        {loose.length > 0 && (
          <div style={S.sheetDay}>
            <div style={S.sheetDayName}>Across the caseload</div>
            {loose.map((x) => {
              const di = dueInfo(x.due, today);
              return (
                <div key={x.id} style={S.sheetRow}>
                  <span style={S.sheetBox} />
                  <span>
                    {x.text}
                    {di ? `  (${di.days < 0 ? "OVERDUE" : "due"} ${di.label})` : ""}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
