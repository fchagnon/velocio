/**
 * Velocio's settings. This is the file to edit for day-to-day tuning.
 */

export const BASE_URL = "https://www.randonneursontario.ca";

/** Chapter results pages that hold brevets and populaires. */
export const BREVET_CHAPTERS = ["huron", "toronto", "ottawa", "simcoe-muskoka"];

/** Every announcement goes here until its chapter has an entry below. */
export const DEFAULT_CHANNEL = "#app-testing";

/**
 * Chapter to channel. Channel IDs (C0123ABC) are safest, since they survive
 * renames, but "#name" works too.
 *   Permanents: chapter comes from the route URL (/routes/<chapter>/...).
 *   Brevets:    chapter comes from the results page they're listed on.
 */
export const CHAPTER_CHANNELS: Record<string, string> = {
  // huron: "#huron",
  // toronto: "#toronto",
  // ottawa: "#ottawa",
  // "simcoe-muskoka": "#simcoe-muskoka",
};

export const CHAPTER_NAMES: Record<string, string> = {
  huron: "Huron",
  toronto: "Toronto",
  ottawa: "Ottawa",
  "simcoe-muskoka": "Simcoe-Muskoka",
};

/**
 * Labels the site shows next to a rider, and how Velocio mentions them.
 * Remove an entry to stop mentioning that label.
 */
export const BADGES: Record<string, string> = {
  "first brevet": ":star2: first brevet, welcome to the club!",
  "completed devil week": ":smiling_imp: survived Devil Week!",
};

/**
 * Brevets: results appear as soon as the first rider submits, even mid-ride,
 * and riders who haven't submitted only show as PENDING once the ride passes
 * its cutoff. So Velocio waits this long after an event first appears...
 */
export const SETTLE_HOURS = 12;

/**
 * ...and also until the latest possible cutoff has passed: the start date,
 * plus LATE_START_HOURS for a start late in the day, plus the time limit.
 */
export const LATE_START_HOURS = 24;

/** (up to km, hours): ACP limits. Anything shorter uses the 200 km limit. */
export const TIME_LIMITS: Array<[number, number]> = [
  [200, 13.5],
  [300, 20],
  [400, 27],
  [600, 40],
  [1000, 75],
  [1200, 90],
  [1400, 116],
];

/**
 * Message style depends on how many riders there are, not the kind of ride:
 *   one rider   -> a personal accomplishment post
 *   two or more -> an event completion post, everyone listed alphabetically
 *                  by last name, DNFs included
 * A lone rider who didn't finish gets no post unless this is true.
 */
export const ANNOUNCE_SOLO_DNF = false;

export const USER_AGENT = "VelocioBot/1.0 (Randonneurs Ontario Slack bot)";
