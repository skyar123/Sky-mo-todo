/* Reading the Child First calendar directly.

   Google Identity Services, token flow. There is no client secret and no
   backend in the path: the browser talks to Google and Google talks back, so
   the sync endpoint still only ever holds ciphertext. The access token lives
   in memory and sessionStorage, never in local storage, because it is a
   credential and it expires within the hour anyway.

   The one hard rule here is which calendars may be read. Two of the calendars
   on this account carry clients' full legal names and record numbers; those
   are worth more care than anything in this app, and they must never be
   fetched, listed as an option, or cached. */

import { readJSON, writeJSON, remove } from "./storage.js";
import { iso, addDays, startOfDay } from "./dates.js";

const GIS_SRC = "https://accounts.google.com/gsi/client";
const SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
const API = "https://www.googleapis.com/calendar/v3";

const TOKEN_KEY = "gcal-token";
const CAL_KEY = "gcal-calendar";
const CACHE_KEY = "gcal-events";

/* Never read from a calendar whose name says it holds legal names. Matched on
   the name rather than an id so a renamed or rebuilt calendar is still caught,
   and applied when listing as well as when fetching. */
const FORBIDDEN = /assessment|assesment|reminder|client/i;
const PREFERRED = /child first/i;

export const isForbiddenCalendar = (summary) => FORBIDDEN.test(String(summary || ""));

let gisPromise = null;

/** Load Google's script once. */
export function loadGIS() {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.google?.accounts?.oauth2) return Promise.resolve(window.google);
  if (gisPromise) return gisPromise;

  gisPromise = new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = GIS_SRC;
    el.async = true;
    el.onload = () =>
      window.google?.accounts?.oauth2
        ? resolve(window.google)
        : reject(new Error("Google sign-in loaded but is not usable"));
    el.onerror = () => reject(new Error("Could not reach Google sign-in"));
    document.head.appendChild(el);
  });
  return gisPromise;
}

/* sessionStorage, so closing the tab drops it. */
function readToken() {
  try {
    const raw = window.sessionStorage.getItem("skymo:" + TOKEN_KEY);
    if (!raw) return null;
    const t = JSON.parse(raw);
    return t.expires > Date.now() + 60000 ? t : null;
  } catch {
    return null;
  }
}

function writeToken(token, expiresInSeconds) {
  try {
    window.sessionStorage.setItem(
      "skymo:" + TOKEN_KEY,
      JSON.stringify({ token, expires: Date.now() + expiresInSeconds * 1000 })
    );
  } catch {
    /* private mode; the token simply will not outlive this page */
  }
}

export function forgetToken() {
  try {
    window.sessionStorage.removeItem("skymo:" + TOKEN_KEY);
  } catch {
    /* nothing to forget */
  }
}

export const hasToken = () => !!readToken();

/**
 * Ask Google for an access token.
 * `interactive` false attempts it silently, which works while the person is
 * still signed in to Google and is what a background refresh should use.
 */
export function requestToken(clientId, { interactive = true } = {}) {
  return loadGIS().then(
    (google) =>
      new Promise((resolve, reject) => {
        const client = google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: SCOPE,
          prompt: interactive ? "" : "none",
          callback: (res) => {
            if (res.error) return reject(new Error(res.error_description || res.error));
            writeToken(res.access_token, Number(res.expires_in) || 3600);
            return resolve(res.access_token);
          },
          error_callback: (err) => reject(new Error(err?.type || "Sign-in was closed")),
        });
        client.requestAccessToken();
      })
  );
}

async function call(path, token, params = {}) {
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401 || res.status === 403) {
    forgetToken();
    throw new Error("Google access expired, sign in again");
  }
  if (!res.ok) throw new Error(`Calendar ${res.status}`);
  return res.json();
}

/** The calendars this app is willing to read. */
export async function listCalendars(clientId) {
  const token = readToken()?.token || (await requestToken(clientId));
  const data = await call("/users/me/calendarList", token, { maxResults: "250", minAccessRole: "reader" });
  return (data.items || [])
    .filter((c) => !isForbiddenCalendar(c.summary))
    .map((c) => ({ id: c.id, summary: c.summary, primary: !!c.primary }))
    .sort((a, b) => (PREFERRED.test(b.summary) ? 1 : 0) - (PREFERRED.test(a.summary) ? 1 : 0));
}

export const readChosenCalendar = () => readJSON(CAL_KEY);
export const writeChosenCalendar = (cal) => writeJSON(CAL_KEY, cal);
export const forgetCalendar = () => {
  remove(CAL_KEY);
  remove(CACHE_KEY);
};

/** Events between two dates, flattened to what the board needs. */
export async function fetchEvents(clientId, calendar, from, days = 14) {
  if (!calendar?.id) throw new Error("No calendar chosen");
  if (isForbiddenCalendar(calendar.summary)) throw new Error("That calendar is not readable by this app");

  const token = readToken()?.token || (await requestToken(clientId));
  const timeMin = startOfDay(from);
  const timeMax = addDays(from, days);
  const data = await call(`/calendars/${encodeURIComponent(calendar.id)}/events`, token, {
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
  });

  const events = (data.items || [])
    .filter((e) => e.status !== "cancelled")
    .map((e) => {
      const startISO = e.start?.dateTime || e.start?.date;
      if (!startISO) return null;
      const allDay = !e.start?.dateTime;
      const start = new Date(startISO);
      return {
        id: e.id,
        title: e.summary || "(no title)",
        allDay,
        date: iso(allDay ? new Date(`${e.start.date}T12:00:00`) : start),
        /* Spoken time, matching how the caseload writes them. */
        time: allDay ? "" : `${((start.getHours() + 11) % 12) + 1}:${String(start.getMinutes()).padStart(2, "0")}`,
        sortAt: start.getTime(),
      };
    })
    .filter(Boolean);

  const cache = { calendar, fetchedAt: Date.now(), from: iso(timeMin), events };
  writeJSON(CACHE_KEY, cache);
  return cache;
}

/** Whatever was last fetched, so the day still works with no signal. */
export const readCachedEvents = () => readJSON(CACHE_KEY);
