import React from "react";
import { S } from "../styles.js";
import { VisitRow } from "./bits.jsx";
import { LONG } from "../lib/dates.js";
import { isScheduled, timeKey } from "../lib/schedule.js";

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function FamiliesTab({ families, counts, supplies, changedFamilies, onOpenFamily }) {
  return (
    <>
      <div style={S.h1}>Families</div>
      <div style={S.sub}>{families.length} on the caseload</div>
      {DAY_ORDER.map((d) => {
        const rows = families
          .filter((c) => (d === 0 ? !isScheduled(c) : c.day === d))
          .sort((a, b) => timeKey(a.time) - timeKey(b.time));
        if (!rows.length) return null;
        return (
          <div key={d}>
            <div style={S.h2}>{d === 0 ? "Not scheduled" : LONG[d]}</div>
            {rows.map((c) => (
              <VisitRow
                key={c.id}
                c={c}
                count={counts[c.id]?.open || 0}
                overdue={counts[c.id]?.overdue || 0}
                supplies={supplies[c.id]}
                changed={changedFamilies?.has(c.id)}
                onClick={() => onOpenFamily(c.id)}
              />
            ))}
          </div>
        );
      })}
    </>
  );
}
