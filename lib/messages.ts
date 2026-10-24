/**
 * Velocio's voice. Edit the template lists freely; anything in {braces} is
 * filled in automatically.
 */

import { ANNOUNCE_SOLO_DNF, BADGES, CHAPTER_CHANNELS, CHAPTER_NAMES, DEFAULT_CHANNEL } from "./config.ts";
import { isFinish, type RideEvent, type Rider } from "./parse.ts";

export const SOLO_FINISH = [
  ":tada: *Look who just finished!* {rider} rode *{route}* ({km} km) in *{time}*. Huge effort, give them a :clap:!",
  ":bike: {rider} just knocked out *{route}*, {km} km in *{time}*! That's how it's done. Chapeau!",
  ":fire: Another card in the books! {rider} finished *{route}* ({km} km) on {date} in *{time}*. Way to go!",
  ":raised_hands: Big day on the {chapter} roads! {rider} conquered *{route}* ({km} km) in *{time}*. How was it out there?",
  ":muscle: {km} km of *{route}*, done and dusted in *{time}*! Nice riding, {rider}!",
];

/** Only used when ANNOUNCE_SOLO_DNF is true. */
export const SOLO_DNF = [
  ":bike: {rider} took on *{route}* ({km} km) on {date}. It didn't go to plan this time, but showing up is the hardest part. Next one's yours!",
];

export const EVENT_OPENERS = [
  ":tada: *That's a wrap on the {route}!* ({km} km, {chapter} chapter, {date})",
  ":bike: The results are in for the {chapter} chapter's *{route}* ({km} km, {date})!",
  ":fire: *{route}* ({km} km, {date}) is officially in the books! Here's the {chapter} chapter crew:",
];

export const EVENT_CLOSERS = [
  "Amazing work out there, everyone. Chapeau! :clap:",
  "Every one of these riders took on {km} km. Give them some love! :raised_hands:",
  "Chapeau to everyone who clipped in! Share your stories and photos in the thread. :camera_with_flash:",
  "What a ride! Whether you finished or not, showing up is the hardest part. See you at the next start line! :bike:",
];

let pick = <T>(list: T[]): T => list[Math.floor(Math.random() * list.length)];

/** Tests use this to make template choice predictable. */
export function setPicker(fn: <T>(list: T[]) => T) {
  pick = fn;
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
 * Slack text for this ride, or null if it shouldn't be posted. Works for any
 * kind of ride. riders defaults to everyone listed for the event.
 */
export function buildMessage(event: RideEvent, chapter: string, riders?: Rider[]): string | null {
  const list = [...(riders ?? event.riders)];
  if (list.length === 0) return null;
  const common = {
    route: link(event.routeUrl, event.route),
    km: event.km,
    date: event.date,
    chapter: chapterName(chapter),
  };

  if (list.length === 1) {
    const r = list[0];
    let templates: string[];
    if (isFinish(r.status)) templates = SOLO_FINISH;
    else if (ANNOUNCE_SOLO_DNF) templates = SOLO_DNF;
    else return null;
    return fill(pick(templates), { ...common, rider: link(r.url, r.name), time: r.status ?? "" }) +
      badgeText(r);
  }

  list.sort((a, b) => (lastNameKey(a) < lastNameKey(b) ? -1 : lastNameKey(a) > lastNameKey(b) ? 1 : 0));
  const finishers = list.filter((r) => isFinish(r.status)).length;
  const lines = list.map((r) => `• ${link(r.url, r.name)}, ${r.status}${badgeText(r)}`).join("\n");
  return [
    fill(pick(EVENT_OPENERS), common),
    `${list.length} riders started, ${finishers} finished.`,
    lines,
    fill(pick(EVENT_CLOSERS), { km: event.km }),
  ].join("\n");
}
