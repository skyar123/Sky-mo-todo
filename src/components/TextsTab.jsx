import React, { useMemo, useState } from "react";
import { S } from "../styles.js";
import { TONES, SHARES, SHARE_TAGS, NOTES, RULES, comingOptions } from "../data/library.js";
import { iso, spokenDate, LONG } from "../lib/dates.js";
import { visitsToText, upcomingTextDays } from "../lib/schedule.js";
import { buildReminderICS, downloadICS, icsFilename } from "../lib/ics.js";
import { handoffMessage } from "../lib/handoff.js";
import { nameOf } from "../lib/identity.js";

const FIRST_TONE = TONES.find((t) => t.id === "first");

const renderShare = (share, size) =>
  share.links.reduce((out, l, i) => out.split(`[link${i + 1}]`).join(l.url), share[size]);

export function TextsTab({ families, today, sent, setSent, copy, initialDay, events, detectFamily, me, onFlash }) {
  const [mode, setMode] = useState("reminders");
  const [tone, setTone] = useState("warm");
  const [coming, setComing] = useState("both"); // both of you is the usual case
  const [shareId, setShareId] = useState(null);
  const [shareTag, setShareTag] = useState("dyad"); // the work is dyadic; start there
  const [len, setLen] = useState("short");

  const days = useMemo(
    () => upcomingTextDays(families, today, events, detectFamily, 4),
    [families, today, events, detectFamily]
  );
  const [dayKey, setDayKey] = useState(() => iso(initialDay || days[0] || today));
  const target = days.find((d) => iso(d) === dayKey) || days[0] || null;

  const T = TONES.find((x) => x.id === tone) || TONES[0];
  const share = SHARES.find((s) => s.id === shareId);
  const visits = useMemo(
    () => (target ? visitsToText(families, target, events, detectFamily) : []),
    [families, target, events, detectFamily]
  );

  /* The whole point of reading the calendar is that a reminder never names a
     time that moved. When one has, say which is which rather than swapping it
     silently: the board may be the thing that needs correcting. */
  const moved = visits.filter((v) => v.was);
  const missing = visits.filter((v) => v.missing);

  return (
    <>
      <div style={S.h1}>Texts</div>
      <div style={S.seg2}>
        {[["reminders", "Reminders"], ["share", "Share"], ["notes", "Notes"]].map(([k, l]) => (
          <button
            key={k}
            onClick={() => { setMode(k); setShareId(null); }}
            style={{ ...S.seg2Btn, ...(mode === k ? S.seg2On : {}) }}
            aria-pressed={mode === k}
          >
            {l}
          </button>
        ))}
      </div>

      {mode === "reminders" && (
        <>
          {days.length > 1 && (
            <div style={S.rowWrap}>
              {days.map((d) => (
                <button
                  key={iso(d)}
                  onClick={() => setDayKey(iso(d))}
                  style={{ ...S.mini, ...(iso(d) === iso(target || today) ? S.miniOn : {}) }}
                  aria-pressed={iso(d) === iso(target || today)}
                >
                  {LONG[d.getDay()].slice(0, 3)} {d.getDate()}
                </button>
              ))}
            </div>
          )}

          <div style={S.sub}>
            {target
              ? `Send the night before, for ${spokenDate(target)}.`
              : "No visits scheduled in the next two weeks."}
          </div>

          {(moved.length > 0 || missing.length > 0) && (
            <div style={{ ...S.rules, background: "#FFF6E8", borderColor: "#E9C98F" }}>
              {moved.map((v) => (
                <div key={v.c.id} style={S.rule}>
                  {v.c.name} is at {v.time} on your calendar. The board still says {v.was},
                  and these messages use the calendar.
                </div>
              ))}
              {missing.map((v) => (
                <div key={v.c.id} style={S.rule}>
                  {v.c.name} has a standing {v.time} slot but is not on your calendar that
                  day. Check before you send.
                </div>
              ))}
            </div>
          )}

          <div style={S.rowWrap}>
            {TONES.map((x) => (
              <button
                key={x.id}
                onClick={() => setTone(x.id)}
                style={{ ...S.mini, ...(tone === x.id ? S.miniOn : {}) }}
                aria-pressed={tone === x.id}
              >
                {x.label}
              </button>
            ))}
          </div>

          <div style={S.fieldLabel}>Who the family should expect</div>
          <div style={{ ...S.rowWrap, marginTop: 6 }}>
            {comingOptions(me).map(([k, l]) => (
              <button
                key={k}
                onClick={() => setComing(k)}
                style={{ ...S.mini, ...(coming === k ? S.miniOn : {}) }}
                aria-pressed={coming === k}
              >
                {l}
              </button>
            ))}
          </div>

          <div style={{ ...S.rowWrap, marginTop: 2 }}>
            <button
              onClick={() => {
                const ics = buildReminderICS(families, today);
                if (!ics) { onFlash?.("Nothing scheduled to remind about"); return; }
                onFlash?.(handoffMessage(downloadICS(ics, icsFilename("send-reminders", today))));
              }}
              style={S.mini}
            >
              Remind me to send these
            </button>
          </div>
          <div style={{ ...S.tip, marginTop: -4, marginBottom: 14 }}>
            Adds a repeating 8am alarm the morning before each visit day, so it
            reaches you whether or not this is open.
          </div>

          {target && visits.length === 0 && (
            <div style={S.empty}>Nobody on that day has texting turned on.</div>
          )}

          {visits.map(({ c, time, live, was, missing: notOnCal }) => {
            const key = c.id + iso(target);
            /* The time in the message is the one on this row, not the one typed
               into the board, so the two can never drift apart on screen. */
            const body = (c.first ? FIRST_TONE : T).build({ ...c, time }, spokenDate(target), coming, me);
            /* Who marked it, when the board knows. Both of them texting the
               same family the night before is the thing to prevent, and "Sent"
               with no name on it does not prevent it. */
            const by = sent[key];
            const done = !!by;
            const theirs = done && by !== true && by !== me;
            return (
              <div key={c.id} style={{ ...S.msg, opacity: done ? 0.55 : 1 }}>
                <div style={S.msgHead}>
                  <span style={{ ...S.dot, background: c.color }} aria-hidden="true" />
                  <span style={{ fontWeight: 700 }}>{c.name}</span>
                  <span style={{ opacity: 0.6, fontSize: 12.5 }}>
                    {time}
                    {live ? " · from your calendar" : ""}
                    {was ? `, was ${was}` : ""}
                    {notOnCal ? " · not on your calendar" : ""}
                  </span>
                </div>
                <div style={S.bubble}>{body}</div>
                <div style={S.rowWrap}>
                  <button onClick={() => copy(body, `Copied for ${c.name}`)} style={S.mini}>Copy</button>
                  <button
                    onClick={() => setSent((p) => ({ ...p, [key]: p[key] ? false : me || true }))}
                    style={{ ...S.mini, ...(done ? S.miniOn : {}) }}
                    aria-pressed={done}
                  >
                    {done ? (theirs ? `${nameOf(by)} sent this ✓` : "Sent ✓") : "Mark sent"}
                  </button>
                </div>
              </div>
            );
          })}
        </>
      )}

      {mode === "share" && !share && (
        <>
          <div style={S.sub}>Something worth passing along. Pick a topic, then pick a length.</div>
          <div style={S.rowWrap}>
            {SHARE_TAGS.map(([k, l]) => (
              <button
                key={k}
                onClick={() => setShareTag(k)}
                style={{ ...S.mini, ...(shareTag === k ? S.miniOn : {}) }}
                aria-pressed={shareTag === k}
              >
                {l}
              </button>
            ))}
          </div>
          {SHARES.filter((s) => shareTag === "all" || s.tag === shareTag).map((s) => (
            <button key={s.id} onClick={() => setShareId(s.id)} style={S.shareRow}>
              <div style={{ fontSize: 15.5, fontWeight: 700 }}>{s.title}</div>
              <div style={{ fontSize: 12.5, opacity: 0.6, marginTop: 2, lineHeight: 1.4 }}>{s.blurb}</div>
            </button>
          ))}
          <div style={{ ...S.sub, marginTop: 18 }}>
            Between them puts something in the relationship. For the caregiver holds up the adult.
            Links are re-checked whenever the board is built.
          </div>
        </>
      )}

      {mode === "share" && share && (
        <>
          <button onClick={() => setShareId(null)} style={S.back}>‹ all topics</button>
          <div style={{ fontSize: 19, fontWeight: 800, marginBottom: 4 }}>{share.title}</div>
          <div style={S.sub}>{share.blurb}</div>
          <div style={S.rowWrap}>
            {[["tiny", "One line"], ["short", "Short"], ["full", "Full"]].map(([k, l]) => (
              <button
                key={k}
                onClick={() => setLen(k)}
                style={{ ...S.mini, ...(len === k ? S.miniOn : {}) }}
                aria-pressed={len === k}
              >
                {l}
              </button>
            ))}
          </div>
          <div style={{ ...S.bubble, whiteSpace: "pre-wrap" }}>{renderShare(share, len)}</div>
          <div style={S.rowWrap}>
            <button onClick={() => copy(renderShare(share, len))} style={S.miniOn2}>Copy this</button>
          </div>
          {share.links.length > 0 && (
            <>
              <div style={S.h2}>Links in this one</div>
              {share.links.map((l, i) => (
                <div key={i} style={S.linkRow}>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{l.label}</div>
                  <div style={S.linkUrl}>{l.url}</div>
                  <button onClick={() => copy(l.url, "Link copied")} style={S.mini}>Copy link</button>
                </div>
              ))}
            </>
          )}
          <div style={S.tip}>Swap [child] for their name and [day] for the next visit before you send.</div>
        </>
      )}

      {mode === "notes" && (
        <>
          <div style={S.sub}>One line, no link, nothing to answer.</div>
          <div style={S.rules}>{RULES.map((r, i) => <div key={i} style={S.rule}>· {r}</div>)}</div>
          {NOTES.map((n, i) => (
            <div key={i} style={S.noteRow}>
              <span style={{ flex: 1, fontSize: 14, lineHeight: 1.5 }}>{n}</span>
              <button onClick={() => copy(n)} style={S.mini}>Copy</button>
            </div>
          ))}
          <div style={S.tip}>
            Anything in [brackets] is a placeholder. Swap it before you send.
          </div>
        </>
      )}
    </>
  );
}
