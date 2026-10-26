/**
 * Reads the live results pages and prints what Velocio would post, without
 * touching Slack or his memory. Run with:  deno task dry-run
 */

import { BASE_URL, BREVET_CHAPTERS, USER_AGENT } from "../lib/config.ts";
import { buildMessage, channelFor } from "../lib/messages.ts";
import { parseResults } from "../lib/parse.ts";
import { brevetComplete, latestCutoff, latestSamples, makeFetchPage } from "../lib/poll.ts";

const fetchPage = makeFetchPage(USER_AGENT, BASE_URL);
const year = new Date().getUTCFullYear();

const perms = parseResults(await fetchPage(year, "permanent"));
console.log(`PERMANENTS: parsed ${perms.length} events.`);

for (const chapter of BREVET_CHAPTERS) {
  const events = parseResults(await fetchPage(year, chapter));
  const waiting = events.filter((e) => !brevetComplete(e));
  console.log(
    `${chapter.toUpperCase()}: parsed ${events.length} events, ${waiting.length} with PENDING riders -> ${
      channelFor(chapter)
    }`,
  );
  for (const e of waiting.slice(0, 3)) {
    const names = e.riders.filter((r) => r.status === null || r.status === "PENDING").map((r) => r.name);
    console.log(`  waiting: ${e.route} (${e.date}): ${names.join(", ")}`);
  }
  for (const e of events.slice(0, 2)) {
    console.log(`  ${e.route} (${e.date}, ${e.km} km): cutoff passes by ${latestCutoff(e).toISOString()} at the latest`);
  }
}

console.log("\nSample posts:\n");
for (const { event, chapter, kind } of await latestSamples(fetchPage)) {
  console.log(`[${kind} -> ${channelFor(chapter)}]`);
  console.log(buildMessage(event, chapter, kind) ?? "(no post: lone rider did not finish)");
  console.log();
}
