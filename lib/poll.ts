/**
 * One polling pass: read the results pages, decide what's new or finished,
 * post it, and record it. Everything Slack-specific (posting, storage) is
 * passed in, so this runs the same on Slack's hosting, in the dry run, and in
 * the tests.
 */

import {
  BREVET_CHAPTERS,
  LATE_START_HOURS,
  SETTLE_HOURS,
  TIME_LIMITS,
} from "./config.ts";
import { parseResults, type RideEvent, type Rider, routeSlug } from "./parse.ts";
import { buildMessage, channelFor, type RideKind, rideKind } from "./messages.ts";

export interface SeenRecord {
  key: string;
  kind: "permanent" | "brevet";
  first_seen: string; // ISO timestamp
  announced: boolean;
  signature: string;
}

export interface Store {
  /** Every record, keyed by record.key. */
  all(): Promise<Map<string, SeenRecord>>;
  putMany(records: SeenRecord[]): Promise<void>;
}

export interface PollDeps {
  fetchPage(year: number, page: string): Promise<string>;
  post(channel: string, text: string): Promise<void>;
  store: Store;
  now?: () => Date;
  log?: (msg: string) => void;
}

export interface PollSummary {
  posted: number;
  seededPermanents: boolean;
  seededBrevets: boolean;
  warnings: string[];
}

const HOUR = 3600_000;
const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

/**
 * Event dates have no time zone on the site. Treat them as starting at
 * midnight Eastern Standard Time (05:00 UTC), the later of EST and EDT, so
 * the cutoff guard errs on the side of waiting.
 */
export function eventStart(date: string): Date {
  const m = /^([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})$/.exec(date.trim());
  if (!m) throw new Error(`Unrecognized date: ${date}`);
  const month = MONTHS.indexOf(m[1].toLowerCase());
  if (month < 0) throw new Error(`Unrecognized month: ${date}`);
  return new Date(Date.UTC(+m[3], month, +m[2], 5));
}

export function timeLimitHours(km: number): number {
  for (const [maxKm, hours] of TIME_LIMITS) if (km <= maxKm) return hours;
  return km / 12; // beyond the table: a generous 12 km/h
}

export function latestCutoff(event: RideEvent): Date {
  return new Date(eventStart(event.date).getTime() + (LATE_START_HOURS + timeLimitHours(event.km)) * HOUR);
}

export function earliestAnnounce(event: RideEvent, firstSeen: Date): Date {
  const settled = firstSeen.getTime() + SETTLE_HOURS * HOUR;
  return new Date(Math.max(settled, latestCutoff(event).getTime()));
}

export function brevetComplete(event: RideEvent): boolean {
  return event.riders.every((r) => r.status !== null && r.status !== "PENDING");
}

export function signature(event: RideEvent): string {
  return event.riders.map((r) => `${r.slug}=${r.status}`).sort().join("|");
}

export function yearsToCheck(now: Date): number[] {
  // Late-filed results from last season can still appear in January.
  const y = now.getUTCFullYear();
  return now.getUTCMonth() === 0 ? [y - 1, y] : [y];
}

const permKey = (e: RideEvent, r: Rider) => `perm|${routeSlug(e)}|${e.date}|${r.slug}`;
const brevetKey = (chapter: string, e: RideEvent) => `brevet|${chapter}|${routeSlug(e)}|${e.date}`;

async function fetchEvents(deps: PollDeps, years: number[], page: string): Promise<RideEvent[]> {
  const pages = await Promise.all(years.map((y) => deps.fetchPage(y, page)));
  return pages.flatMap(parseResults);
}

export async function pollOnce(deps: PollDeps): Promise<PollSummary> {
  const now = (deps.now ?? (() => new Date()))();
  const log = deps.log ?? console.log;
  const years = yearsToCheck(now);
  const summary: PollSummary = { posted: 0, seededPermanents: false, seededBrevets: false, warnings: [] };

  // Fetch everything up front, in parallel, to stay well inside the time limit.
  const [permanents, ...chapterPages] = await Promise.all([
    fetchEvents(deps, years, "permanent"),
    ...BREVET_CHAPTERS.map((c) => fetchEvents(deps, years, c)),
  ]);
  const records = await deps.store.all();
  const pending: SeenRecord[] = [];
  const stamp = now.toISOString();

  const announce = async (channel: string, text: string, recs: SeenRecord[]) => {
    await deps.post(channel, text);
    summary.posted++;
    // Recorded right after a successful post, so a Slack hiccup retries next run.
    await deps.store.putMany(recs);
  };

  // ---- permanents: once the ride is past its cutoff and nobody is PENDING,
  // everyone not yet announced goes out together in one post. Riders who
  // submit before the cutoff wait for their ridemates; anyone who submits
  // later still gets announced on their own.
  if (permanents.length === 0) {
    summary.warnings.push("Permanents: parsed zero results. Has the page layout changed?");
  } else {
    const seeding = ![...records.values()].some((r) => r.kind === "permanent");
    summary.seededPermanents = seeding;
    for (const event of [...permanents].reverse()) { // oldest first
      if (!seeding && (!brevetComplete(event) || now < latestCutoff(event))) continue;
      // A PENDING or blank result isn't final yet, so leave it for a later run.
      const fresh = event.riders.filter((r) =>
        !records.has(permKey(event, r)) && r.status !== null && r.status !== "PENDING"
      );
      if (fresh.length === 0) continue;
      const recs: SeenRecord[] = fresh.map((r) => ({
        key: permKey(event, r),
        kind: "permanent",
        first_seen: stamp,
        announced: true,
        signature: `${r.status}`,
      }));
      recs.forEach((r) => records.set(r.key, r));
      const text = seeding ? null : buildMessage(event, event.routeChapter, "permanent", fresh);
      if (text) {
        await announce(channelFor(event.routeChapter), text, recs);
        log(`Announced permanent ${event.route} on ${event.date} (${fresh.length} riders)`);
      } else {
        pending.push(...recs);
      }
    }
  }

  // ---- brevets: once complete, settled, and past the cutoff
  const brevetSeeding = ![...records.values()].some((r) => r.kind === "brevet");
  summary.seededBrevets = brevetSeeding;
  for (const [i, chapter] of BREVET_CHAPTERS.entries()) {
    const events = chapterPages[i];
    if (events.length === 0) {
      summary.warnings.push(`Brevets: parsed zero results for ${chapter}. Has the page layout changed?`);
      continue;
    }
    for (const event of [...events].reverse()) {
      const key = brevetKey(chapter, event);
      const sig = signature(event);
      const complete = brevetComplete(event);
      const rec = records.get(key);

      if (!rec) {
        // On the very first run, events already complete and past their cutoff
        // are old news. Everything else waits its turn.
        const fresh: SeenRecord = {
          key,
          kind: "brevet",
          first_seen: stamp,
          announced: brevetSeeding && complete && now >= latestCutoff(event),
          signature: sig,
        };
        records.set(key, fresh);
        pending.push(fresh);
        continue;
      }

      if (rec.announced) {
        if (rec.signature !== sig) {
          log(`Brevet ${key} changed after it was announced; not re-announcing.`);
          pending.push({ ...rec, signature: sig });
        }
        continue;
      }

      if (complete && now >= earliestAnnounce(event, new Date(rec.first_seen))) {
        const done = { ...rec, announced: true, signature: sig };
        const text = buildMessage(event, chapter, rideKind(false, event.km));
        if (text) {
          await announce(channelFor(chapter), text, [done]);
          log(`Announced ${key} (${event.riders.length} riders)`);
        } else {
          pending.push(done);
          log(`${key}: lone rider did not finish; no post.`);
        }
      } else if (rec.signature !== sig) {
        pending.push({ ...rec, signature: sig });
      }
    }
  }

  if (pending.length) await deps.store.putMany(pending);
  if (summary.seededPermanents) log("Permanents first run: recorded existing results without announcing them.");
  if (summary.seededBrevets) log("Brevets first run: recorded existing events; only newly completed ones will be announced.");
  summary.warnings.forEach((w) => log(`WARNING: ${w}`));
  return summary;
}

/** The most recent permanent and group brevet, for the sample-post workflow. */
export async function latestSamples(
  fetchPage: PollDeps["fetchPage"],
  now = new Date(),
): Promise<Array<{ event: RideEvent; chapter: string; kind: RideKind }>> {
  const year = now.getUTCFullYear();
  const out: Array<{ event: RideEvent; chapter: string; kind: RideKind }> = [];
  const perms = parseResults(await fetchPage(year, "permanent"));
  if (perms[0]) out.push({ event: perms[0], chapter: perms[0].routeChapter, kind: "permanent" });
  for (const chapter of BREVET_CHAPTERS) {
    const hit = parseResults(await fetchPage(year, chapter)).find((e) => brevetComplete(e) && e.riders.length > 1);
    if (hit) {
      out.push({ event: hit, chapter, kind: rideKind(false, hit.km) });
      break;
    }
  }
  return out;
}

export function makeFetchPage(userAgent: string, base: string) {
  return async (year: number, page: string): Promise<string> => {
    const resp = await fetch(`${base}/results/${year}/${page}`, { headers: { "User-Agent": userAgent } });
    if (!resp.ok) throw new Error(`GET ${page} ${year}: HTTP ${resp.status}`);
    return await resp.text();
  };
}
