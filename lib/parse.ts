/**
 * Reads a Randonneurs Ontario results page.
 *
 * Deliberately dependency-free (no DOM library), because it runs on Slack's
 * hosting. It walks the page's tags and text in document order:
 *   - a heading with a /routes/ link starts an event,
 *   - the "Month D, YYYY · NNN km" text gives date and distance,
 *   - each /riders/ link starts a rider, whose status is the next
 *     time/DNF/PENDING-looking text,
 *   - known labels such as "First Brevet" become badges.
 */

import { BADGES, BASE_URL } from "./config.ts";

export interface Rider {
  name: string;
  url: string;
  slug: string;
  status: string | null;
  badges: string[];
}

export interface RideEvent {
  route: string;
  routeUrl: string;
  routeChapter: string;
  date: string; // as shown, e.g. "September 5, 2026"
  km: number;
  riders: Rider[];
}

export const TIME_RE = /^\d{1,3}:\d{2}$/;
const STATUS_RE = /^(\d{1,3}:\d{2}|DNF|DNS|OTL|DQ|PENDING)$/i;
const DATE_RE = /([A-Z][a-z]+\s+\d{1,2},\s+\d{4})\s*·\s*(\d+)\s*km/;

const TOKEN_RE =
  /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|([^<]+)|(<)/g;

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  middot: "·",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

function attr(attrs: string, name: string): string | null {
  const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i").exec(attrs);
  return m ? decodeEntities(m[2] ?? m[3] ?? "") : null;
}

function abs(href: string): string {
  return href.startsWith("http") ? href : BASE_URL + href;
}

interface Draft extends RideEvent {
  buf: string;
  dateFound: boolean;
}

export function parseResults(html: string): RideEvent[] {
  // Start at the main content so navigation menus are ignored.
  const start = html.indexOf('id="main-content"');
  if (start >= 0) html = html.slice(html.lastIndexOf("<", start));

  const events: Draft[] = [];
  let event: Draft | null = null;
  let rider: Rider | null = null;

  let heading: { href: string | null; text: string } | null = null;
  let inRouteLink = false;
  let riderLink: Rider | null = null;

  TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(html)) !== null) {
    const [, closing, rawTag, attrs, rawText, stray] = m;

    if (rawTag) {
      const tag = rawTag.toLowerCase();
      if (!closing && (tag === "script" || tag === "style" || tag === "template")) {
        const end = html.toLowerCase().indexOf(`</${tag}`, TOKEN_RE.lastIndex);
        TOKEN_RE.lastIndex = end < 0 ? html.length : end;
        continue;
      }
      if (tag === "h2" || tag === "h3") {
        if (!closing) {
          heading = { href: null, text: "" };
        } else if (heading) {
          if (heading.href) {
            const parts = heading.href.split("/routes/")[1].replace(/^\/+|\/+$/g, "").split("/");
            event = {
              route: heading.text.replace(/\s+/g, " ").trim(),
              routeUrl: abs(heading.href),
              routeChapter: parts[0] ?? "",
              date: "",
              km: 0,
              riders: [],
              buf: "",
              dateFound: false,
            };
            events.push(event);
          } else {
            event = null; // some other section, e.g. the footer
          }
          rider = null;
          heading = null;
        }
        continue;
      }
      if (tag === "a") {
        if (closing) {
          inRouteLink = false;
          riderLink = null;
          continue;
        }
        const href = attr(attrs, "href") ?? "";
        if (heading && href.includes("/routes/") && !heading.href) {
          heading.href = href;
          inRouteLink = true;
        } else if (!heading && event && href.includes("/riders/")) {
          rider = {
            name: "",
            url: abs(href),
            slug: href.replace(/\/+$/, "").split("/").pop() ?? "",
            status: null,
            badges: [],
          };
          event.riders.push(rider);
          riderLink = rider;
        }
      }
      continue;
    }

    const textRaw = rawText ?? stray;
    if (!textRaw) continue;
    const text = decodeEntities(textRaw).replace(/\s+/g, " ").trim();
    if (!text) continue;

    if (heading) {
      if (inRouteLink) heading.text += " " + text;
      continue;
    }
    if (riderLink) {
      riderLink.name = (riderLink.name + " " + text).trim();
      continue;
    }
    if (!event) continue;

    if (!event.dateFound) {
      // React can split this line into several text nodes, so accumulate.
      event.buf += " " + text;
      const d = DATE_RE.exec(event.buf);
      if (d) {
        event.date = d[1].replace(/\s+/g, " ");
        event.km = parseInt(d[2], 10);
        event.dateFound = true;
      }
    }
    if (!rider) continue;
    if (rider.status === null && STATUS_RE.test(text)) {
      rider.status = text.toUpperCase();
    } else if (text.toLowerCase() in BADGES && !rider.badges.includes(text.toLowerCase())) {
      rider.badges.push(text.toLowerCase());
    }
  }

  return events
    .filter((e) => e.dateFound && e.riders.length > 0)
    .map(({ buf: _b, dateFound: _d, ...e }) => e);
}

export function routeSlug(event: RideEvent): string {
  return event.routeUrl.replace(/\/+$/, "").split("/").pop() ?? "";
}

export function isFinish(status: string | null): boolean {
  return status !== null && TIME_RE.test(status);
}
