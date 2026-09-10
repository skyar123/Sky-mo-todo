/* Calendar reminders.
   A static site cannot push a notification to a phone: web push needs a
   server and a subscription, and on iOS it only works once the app has been
   added to the home screen. A calendar file needs none of that. It opens in
   whatever calendar the phone already uses, and the reminder fires from
   there even when this board is closed. */

import { parseISO, iso, addDays, LONG } from "./dates.js";
import { visitsOn, isScheduled } from "./schedule.js";
import { handOff } from "./handoff.js";

const pad = (n) => String(n).padStart(2, "0");
const stamp = (d) =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
const dateOnly = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;

/* Commas, semicolons, backslashes and newlines are all structural in ICS. */
const esc = (s) =>
  String(s || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");

/* Lines over 75 octets must be folded, or strict parsers reject the file. */
function fold(line) {
  if (line.length <= 74) return line;
  const out = [line.slice(0, 74)];
  let rest = line.slice(74);
  while (rest.length > 73) {
    out.push(" " + rest.slice(0, 73));
    rest = rest.slice(73);
  }
  if (rest) out.push(" " + rest);
  return out.join("\r\n");
}

const uid = (task) => `skymo-${task.id}@sky-mo-caseload`;

/**
 * One all-day event per task, on its due date, with an alarm the day before.
 * Family names are pseudonyms already, so nothing identifying leaves the app
 * that was not already in the calendar this is going into.
 */
function vevent(task, family, { alarmDaysBefore = 1 } = {}) {
  const due = parseISO(task.due);
  if (!due) return null;
  const end = new Date(due);
  end.setDate(end.getDate() + 1); // DTEND is exclusive for all-day events

  const title = family ? `${family.name} · ${task.text}` : task.text;
  const body = [task.note, family ? `Family: ${family.name}` : null, "Added from sky + mo"]
    .filter(Boolean)
    .join("\n");

  return [
    "BEGIN:VEVENT",
    `UID:${uid(task)}`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART;VALUE=DATE:${dateOnly(due)}`,
    `DTEND;VALUE=DATE:${dateOnly(end)}`,
    fold(`SUMMARY:${esc(title)}`),
    fold(`DESCRIPTION:${esc(body)}`),
    "TRANSP:TRANSPARENT",
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    fold(`DESCRIPTION:${esc(title)}`),
    `TRIGGER:-P${alarmDaysBefore}D`,
    "END:VALARM",
    "END:VEVENT",
  ].join("\r\n");
}

export function buildICS(tasks, familyById, opts) {
  const events = tasks.map((t) => vevent(t, t.client ? familyById.get(t.client) : null, opts)).filter(Boolean);
  if (!events.length) return null;
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//sky + mo//caseload board//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");
}

export function downloadICS(content, filename) {
  return handOff(content, filename, "text/calendar;charset=utf-8", { title: "Add to calendar" });
}

export const icsFilename = (label, today) =>
  `skymo-${label}-${iso(today)}.ics`.replace(/[^a-zA-Z0-9._-]/g, "-");


/* ---------------------------------------------------------------------------
   The standing nudge to send tomorrow's reminders.

   A text that goes out the night before only helps if it actually goes out.
   The board can show a prompt, but only while it is open. A repeating calendar
   entry the morning before each visit day fires whether or not the board is
   open, from the calendar already being watched.

   Times are floating: no Z and no TZID, so they mean 8am wherever the phone
   is, which is what a morning routine should do. --------------------------- */

const BYDAY = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

const local = (d, hour, minute = 0) =>
  `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(hour)}${pad(minute)}00`;

/** The next date on or after `from` that falls on weekday `dow`. */
function nextDow(from, dow) {
  const delta = (dow - from.getDay() + 7) % 7;
  return addDays(from, delta);
}

/**
 * One weekly repeating event per visit day, set the morning before, listing
 * who is expected. Regenerate it after the schedule changes.
 */
export function buildReminderICS(families, today, { hour = 8 } = {}) {
  const days = [...new Set(families.filter((f) => isScheduled(f) && f.texts).map((f) => f.day))].sort();
  if (!days.length) return null;

  const events = days.map((day) => {
    const eve = (day + 6) % 7; // the day before
    let first = nextDow(today, eve);
    /* If that morning has already gone by, start next week rather than
       writing a first occurrence whose alarm can never fire. */
    const at = new Date(first);
    at.setHours(hour, 0, 0, 0);
    if (at.getTime() <= Date.now()) first = addDays(first, 7);
    const who = visitsOn(families, { getDay: () => day })
      .filter((f) => f.texts)
      .map((f) => `${f.name} at ${f.time}`)
      .join(", ");

    return [
      "BEGIN:VEVENT",
      `UID:skymo-remind-${day}@sky-mo-caseload`,
      `DTSTAMP:${stamp(new Date())}`,
      `DTSTART:${local(first, hour)}`,
      `DTEND:${local(first, hour, 15)}`,
      `RRULE:FREQ=WEEKLY;BYDAY=${BYDAY[eve]}`,
      fold(`SUMMARY:${esc(`Text tomorrow's families (${LONG[day]})`)}`),
      fold(`DESCRIPTION:${esc(`Open sky + mo, Texts tab, and send ${LONG[day]}'s reminders.\n${who}`)}`),
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      fold(`DESCRIPTION:${esc(`Text tomorrow's families (${LONG[day]})`)}`),
      "TRIGGER:PT0M",
      "END:VALARM",
      "END:VEVENT",
    ].join("\r\n");
  });

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//sky + mo//caseload board//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");
}
