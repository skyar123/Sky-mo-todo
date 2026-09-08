/* Calendar reminders.
   A static site cannot push a notification to a phone: web push needs a
   server and a subscription, and on iOS it only works once the app has been
   added to the home screen. A calendar file needs none of that. It opens in
   whatever calendar the phone already uses, and the reminder fires from
   there even when this board is closed. */

import { parseISO, iso } from "./dates.js";

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
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const icsFilename = (label, today) =>
  `skymo-${label}-${iso(today)}.ics`.replace(/[^a-zA-Z0-9._-]/g, "-");
