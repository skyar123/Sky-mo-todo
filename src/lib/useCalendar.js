import { useCallback, useEffect, useState } from "react";
import {
  requestToken, hasToken, forgetToken, listCalendars, fetchEvents,
  readChosenCalendar, writeChosenCalendar, forgetCalendar, readCachedEvents,
} from "./gcal.js";
import { GOOGLE_CLIENT_ID } from "../data/config.js";

const PREFERRED = /child first/i;

/**
 * Live visit times from Google Calendar.
 *
 * The cached events are shown immediately and refreshed behind them, so a bad
 * signal costs nothing: the board still opens on whatever it last knew, marked
 * with when that was.
 */
export function useCalendar(today) {
  const [calendar, setCalendar] = useState(() => readChosenCalendar());
  const [cache, setCache] = useState(() => readCachedEvents());
  const [choices, setChoices] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | working | error
  const [error, setError] = useState("");

  const refresh = useCallback(
    async ({ interactive = false } = {}) => {
      const chosen = readChosenCalendar();
      if (!chosen) return;
      setStatus("working");
      setError("");
      try {
        if (!hasToken()) await requestToken(GOOGLE_CLIENT_ID, { interactive });
        setCache(await fetchEvents(GOOGLE_CLIENT_ID, chosen, today));
        setStatus("idle");
      } catch (e) {
        /* Silent renewal failing is ordinary: the Google session lapsed and
           the next deliberate tap will ask properly. */
        setStatus(interactive ? "error" : "idle");
        if (interactive) setError(e.message || "Could not read the calendar");
      }
    },
    [today]
  );

  /* On open, top up quietly if this device is already connected. */
  useEffect(() => {
    if (readChosenCalendar()) refresh({ interactive: false });
  }, [refresh]);

  const connect = useCallback(async () => {
    setStatus("working");
    setError("");
    try {
      await requestToken(GOOGLE_CLIENT_ID, { interactive: true });
      const list = await listCalendars(GOOGLE_CLIENT_ID);
      if (!list.length) throw new Error("No readable calendars on that account");
      setChoices(list);

      /* The Child First one is almost certainly what is wanted, so take it and
         let the choice be changed rather than asking first. */
      const pick = list.find((c) => PREFERRED.test(c.summary)) || list[0];
      writeChosenCalendar(pick);
      setCalendar(pick);
      setCache(await fetchEvents(GOOGLE_CLIENT_ID, pick, today));
      setStatus("idle");
    } catch (e) {
      setStatus("error");
      setError(e.message || "Could not connect");
    }
  }, [today]);

  const choose = useCallback(
    async (cal) => {
      writeChosenCalendar(cal);
      setCalendar(cal);
      setStatus("working");
      try {
        setCache(await fetchEvents(GOOGLE_CLIENT_ID, cal, today));
        setStatus("idle");
      } catch (e) {
        setStatus("error");
        setError(e.message || "Could not read that calendar");
      }
    },
    [today]
  );

  const openChoices = useCallback(async () => {
    try {
      setChoices(await listCalendars(GOOGLE_CLIENT_ID));
    } catch (e) {
      setError(e.message || "Could not list calendars");
    }
  }, []);

  const disconnect = useCallback(() => {
    forgetToken();
    forgetCalendar();
    setCalendar(null);
    setCache(null);
    setChoices(null);
    setStatus("idle");
    setError("");
  }, []);

  return {
    connected: !!calendar,
    calendar,
    choices,
    events: cache?.events || null,
    fetchedAt: cache?.fetchedAt || null,
    status,
    error,
    connect,
    choose,
    openChoices,
    refresh,
    disconnect,
  };
}
