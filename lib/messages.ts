/**
 * Velocio's voice. Edit the template lists freely; anything in {braces} is
 * filled in automatically.
 */

import {
  ANNOUNCE_SOLO_DNF,
  BADGES,
  BASE_URL,
  CHAPTER_CHANNELS,
  CHAPTER_NAMES,
  DEFAULT_CHANNEL,
  PERMANENT_INVITE_CHANCE,
} from "./config.ts";
import { isFinish, type RideEvent, type Rider } from "./parse.ts";

/**
 * Placeholders you can use:
 *   {rider}  the rider's name, linked to their profile
 *   {ride}   the route name plus the ride type, e.g. "*Black Gold 200* brevet"
 *            or "*Mean Streets* permanent" (linked to the route)
 *   {kind}   just the ride type: brevet, populaire or permanent
 *   {host}   who it belongs to: "Huron chapter" for brevets and populaires,
 *            "Huron route" for permanents
 *   {km}, {date}, {time}, {chapter}
 */

export const SOLO_FINISH = [
  ":tada: *Look who just finished a {kind}!* {rider} rode the {ride} ({km} km) in *{time}*. Huge effort, give them a :clap:!",
  ":bike: {rider} just knocked out the {ride}, {km} km in *{time}*! That's how it's done. Chapeau!",
  ":fire: Another {kind} in the books! {rider} finished the {ride} ({km} km) on {date} in *{time}*. Way to go!",
  ":raised_hands: Big day on the {chapter} roads! {rider} conquered the {ride} ({km} km) in *{time}*. How was it out there?",
  ":muscle: The {ride}, {km} km, done and dusted in *{time}*! Nice riding, {rider}!",
];

/** Only used when ANNOUNCE_SOLO_DNF is true. */
export const SOLO_DNF = [
  ":bike: {rider} took on the {ride} ({km} km) on {date}. It didn't go to plan this time, but showing up is the hardest part. Next one's yours!",
];

export const EVENT_OPENERS = [
  ":tada: That's a wrap on the {ride}! ({km} km, {host}, {date})",
  ":bike: The results are in for the {ride} ({km} km, {host}, {date})!",
  ":fire: The {ride} ({km} km, {date}) is officially in the books! Here's the crew:",
];

export const EVENT_CLOSERS = [
  "Amazing work out there, everyone. Chapeau! :clap:",
  "Every one of these riders took on {km} km. Give them some love! :raised_hands:",
  "Chapeau to everyone who clipped in! Share your stories and photos in the thread. :camera_with_flash:",
  "What a ride! Whether you finished or not, showing up is the hardest part. See you at the next start line! :bike:",
];

/**
 * Sometimes added to the end of a permanent post (see
 * PERMANENT_INVITE_CHANCE in config.ts), to remind people they can ride one
 * any day they like. {register} is the link to the registration page.
 */
export const PERMANENT_INVITES = [
  ":calendar: Permanents can be ridden any day you choose. Fancy one of your own? {register}",
  ":bulb: No brevet on the calendar? Pick a route and a date and ride a permanent. {register}",
  ":world_map: Inspired? You can ride this route, or any other, as a permanent whenever suits you. {register}",
];

export type RideKind = "brevet" | "populaire" | "permanent";

/** Permanents come from the permanents page; anything under 200 km elsewhere is a populaire. */
export function rideKind(isPermanent: boolean, km: number): RideKind {
  if (isPermanent) return "permanent";
  return km < 200 ? "populaire" : "brevet";
}

let pick = <T>(list: T[]): T => list[Math.floor(Math.random() * list.length)];

let roll = () => Math.random();

/** Tests use these to make template choice and the invite predictable. */
export function setPicker(fn: <T>(list: T[]) => T) {
  pick = fn;
}
export function setRoller(fn: () => number) {
  roll = fn;
}

function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? String(values[k]) : m));
}

function link(url: string, text: string): string {
  return `<${url}|${text}>`;
}

export function chapterName(key: string): string {
  return CHAPTER_NAMES[key] ?? key.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function channelFor(chapter: string): string {
  return CHAPTER_CHANNELS[chapter] ?? DEFAULT_CHANNEL;
}

function badgeText(r: Rider): string {
  const extras = r.badges.filter((b) => b in BADGES).map((b) => BADGES[b]);
  return extras.length ? " " + extras.join(" ") : "";
}

/** Sort the way the website does: by the last word of the name. */
export function lastNameKey(r: Rider): string {
  const words = r.name.split(/\s+/);
  return `${(words[words.length - 1] ?? "").toLowerCase()}\u0000${r.name.toLowerCase()}`;
}

/**
 * Slack text for this ride, or null if it shouldn't be posted. riders
 * defaults to everyone listed for the event.
 */
export function buildMessage(event: RideEvent, chapter: string, kind: RideKind, riders?: Rider[]): string | null {
  const list = [...(riders ?? event.riders)];
  if (list.length === 0) return null;
  const route = link(event.routeUrl, event.route);
  // Don't say "Blini Populaire populaire" when the name already has the type.
  const ride = event.route.toLowerCase().includes(kind) ? `*${route}*` : `*${route}* ${kind}`;
  const common = {
    route,
    ride,
    kind,
    host: `${chapterName(chapter)} ${kind === "permanent" ? "route" : "chapter"}`,
    km: event.km,
    date: event.date,
    chapter: chapterName(chapter),
    register: link(`${BASE_URL}/register/permanent`, "Register a permanent"),
  };
  const invite = kind === "permanent" && roll() < PERMANENT_INVITE_CHANCE
    ? "\n" + fill(pick(PERMANENT_INVITES), common)
    : "";

  if (list.length === 1) {
    const r = list[0];
    let templates: string[];
    if (isFinish(r.status)) templates = SOLO_FINISH;
    else if (ANNOUNCE_SOLO_DNF) templates = SOLO_DNF;
    else return null;
    return fill(pick(templates), { ...common, rider: link(r.url, r.name), time: r.status ?? "" }) +
      badgeText(r) + invite;
  }

  list.sort((a, b) => (lastNameKey(a) < lastNameKey(b) ? -1 : lastNameKey(a) > lastNameKey(b) ? 1 : 0));
  const finishers = list.filter((r) => isFinish(r.status)).length;
  const lines = list.map((r) => `• ${link(r.url, r.name)}, ${r.status}${badgeText(r)}`).join("\n");
  return [
    fill(pick(EVENT_OPENERS), common),
    `${list.length} riders started, ${finishers} finished.`,
    lines,
    fill(pick(EVENT_CLOSERS), { km: event.km }),
  ].join("\n") + invite;
}
