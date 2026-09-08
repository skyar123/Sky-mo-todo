/* Test expectations are derived from the real caseload at run time, decrypted
   with SKYMO_PASSCODE. Nothing about a family is written into these files:
   the repo is public and the test suite is not an exception to that. */

import { readFile } from "node:fs/promises";
import { decryptJSON } from "../src/lib/crypto.js";
import { startOfDay, iso, addDays } from "../src/lib/dates.js";
import { visitsOn, nextVisitDay } from "../src/lib/schedule.js";

export async function loadFixture() {
  const passcode = process.env.SKYMO_PASSCODE;
  if (!passcode) throw new Error("SKYMO_PASSCODE is not set; the suite cannot decrypt the caseload.");

  const payload = JSON.parse(await readFile(new URL("../public/caseload.enc.json", import.meta.url), "utf8"));
  const { data } = await decryptJSON(payload, passcode);
  const { families, seedTasks } = data;

  /* Pin the board to a day that actually has visits, so assertions about
     "today", "tomorrow" and "week of" hold whenever this is run. */
  const today = nextVisitDay(families, startOfDay()) || startOfDay();
  const todayVisits = visitsOn(families, today);
  const reminderDay = nextVisitDay(families, addDays(today, 1));
  const reminderVisits = reminderDay ? visitsOn(families, reminderDay) : [];

  const withChild = families.find((f) => f.child && /,\s*\d/.test(f.child));
  const firstVisit = families.find((f) => f.first);
  const unscheduled = families.filter((f) => !(f.day >= 1 && f.day <= 6));

  /* A word that appears in exactly one family's tasks, for the search test. */
  const counts = new Map();
  for (const t of seedTasks) {
    for (const w of new Set(`${t.text} ${t.note}`.toLowerCase().match(/[a-z]{5,}/g) || [])) {
      const e = counts.get(w) || new Set();
      e.add(t.client);
      counts.set(w, e);
    }
  }
  const searchTerm = [...counts.entries()].find(
    ([w, clients]) => clients.size === 1 && [...clients][0] && !families.some((f) => f.name.toLowerCase().includes(w))
  );

  return {
    families,
    seedTasks,
    today,
    todayIso: iso(today),
    todayVisits,
    reminderDay,
    reminderVisits,
    withChild,
    firstVisit,
    unscheduled,
    searchWord: searchTerm?.[0],
    searchOwner: families.find((f) => f.id === [...searchTerm[1]][0]),
  };
}
