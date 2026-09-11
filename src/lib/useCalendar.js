import { useCallback, useEffect, useState } from "react";
import {
  requestToken, hasToken, forgetToken, listCalendars, fetchEvents,
  readChosenCalendar, writeChosenCalendar, forgetCalendar, readCachedEvents,
} from "./gcal.js";
import { clientId, setClientId, isCustomClientId } from "../data/config.js";

const PREFERRED = /child first/i;

/* Google reports its refusals in its own vocabulary, and two of them are
   routine enough here to be worth saying plainly. `org_internal` means the
   consent screen is set to Internal, so only members of a Workspace can ever
   sign in; a personal Gmail address never will. `invalid_client` means the id
   names no project that will accept this page. Both are fixed in Google's
   console, not here, so the message says which door to knock on. */
function friendly(e) {
  const raw = String(e?.message || e || "");
  if (/org_internal|only be used within its organization/i.test(raw))
    return "Google says that project is limited to one organisation. Its consent screen needs to be External, or use a client id from your own project.";
  if (/invalid_client|OAuth client was not found/i.test(raw))
    return "Google does not recognise that client id. Check it, or paste a new one below.";
  if (/redirect_uri_mismatch|origin/i.test(raw))
    return "Google refused this address. Add it under Authorised JavaScript origins on that client id.";
  if (/access_denied/i.test(raw))
    return "Google turned the sign-in down. If it said the app is limited to an organisation, its consent screen needs to be External.";
  if (/popup_closed|closed/i.test(raw)) return "Sign-in was closed before it finished.";
  if (/popup_failed_to_open/i.test(raw)) return "The browser blocked Google's sign-in window.";
  if (/no_client_id/.test(raw)) return "Add a Google client id first.";
  return raw || "Could not connect";
}

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
  const [id, setId] = useState(() => clientId());

  const refresh = useCallback(
    async ({ interactive = false } = {}) => {
      const chosen = readChosenCalendar();
      if (!chosen) return;
      setStatus("working");
      setError("");
      try {
        const id = clientId();
        if (!hasToken()) await requestToken(id, { interactive });
        setCache(await fetchEvents(id, chosen, today));
        setStatus("idle");
      } catch (e) {
        /* Silent renewal failing is ordinary: the Google session lapsed and
           the next deliberate tap will ask properly. */
        setStatus(interactive ? "error" : "idle");
        if (interactive) setError(friendly(e));
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
      const id = clientId();
      if (!id) throw new Error("no_client_id");
      await requestToken(id, { interactive: true });
      const list = await listCalendars(id);
      if (!list.length) throw new Error("No readable calendars on that account");
      setChoices(list);

      /* The Child First one is almost certainly what is wanted, so take it and
         let the choice be changed rather than asking first. */
      const pick = list.find((c) => PREFERRED.test(c.summary)) || list[0];
      writeChosenCalendar(pick);
      setCalendar(pick);
      setCache(await fetchEvents(id, pick, today));
      setStatus("idle");
    } catch (e) {
      setStatus("error");
      setError(friendly(e));
    }
  }, [today]);

  const choose = useCallback(
    async (cal) => {
      writeChosenCalendar(cal);
      setCalendar(cal);
      setStatus("working");
      try {
        setCache(await fetchEvents(clientId(), cal, today));
        setStatus("idle");
      } catch (e) {
        setStatus("error");
        setError(friendly(e));
      }
    },
    [today]
  );

  const openChoices = useCallback(async () => {
    try {
      setChoices(await listCalendars(clientId()));
    } catch (e) {
      setError(friendly(e));
    }
  }, []);

  /* Point this device at a different Google project. Getting the id right is
     the fiddly part of connecting, and it should not need a rebuild. */
  const useProject = useCallback((value) => {
    const next = setClientId(value);
    setId(next);
    forgetToken();
    setStatus("idle");
    setError("");
    return next;
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
    clientId: id,
    haveId: !!id,
    ownProject: isCustomClientId(),
    useProject,
    connect,
    choose,
    openChoices,
    refresh,
    disconnect,
  };
}
