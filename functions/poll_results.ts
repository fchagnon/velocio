import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import type { SlackAPIClient } from "deno-slack-api/types.ts";
import AnnouncementsDatastore from "../datastores/announcements.ts";
import { BASE_URL, DEFAULT_CHANNEL, USER_AGENT } from "../lib/config.ts";
import { buildMessage } from "../lib/messages.ts";
import { latestSamples, makeFetchPage, pollOnce, type SeenRecord, type Store } from "../lib/poll.ts";

export const PollResultsFunction = DefineFunction({
  callback_id: "poll_results",
  title: "Check results and announce",
  description: "Reads the club results pages and posts new finishes and completed events",
  source_file: "functions/poll_results.ts",
  input_parameters: {
    properties: {
      mode: {
        type: Schema.types.string,
        description: '"poll" for normal runs, "sample" to post the latest results to the test channel',
        enum: ["poll", "sample"],
      },
    },
    required: ["mode"],
  },
  output_parameters: {
    properties: {
      posted: { type: Schema.types.integer, description: "Messages posted" },
    },
    required: ["posted"],
  },
});

const DATASTORE = AnnouncementsDatastore.name;
const CHUNK = 25;

/** Velocio's memory, kept in the app's Slack-hosted datastore. */
function slackStore(client: SlackAPIClient): Store {
  return {
    async all() {
      const out = new Map<string, SeenRecord>();
      let cursor: string | undefined;
      do {
        const resp = await client.apps.datastore.query<typeof AnnouncementsDatastore.definition>({
          datastore: DATASTORE,
          limit: 1000,
          ...(cursor ? { cursor } : {}),
        });
        if (!resp.ok) throw new Error(`Datastore query failed: ${resp.error}`);
        for (const item of resp.items) out.set(item.key, item as SeenRecord);
        cursor = resp.response_metadata?.next_cursor || undefined;
      } while (cursor);
      return out;
    },
    async putMany(records) {
      for (let i = 0; i < records.length; i += CHUNK) {
        const resp = await client.apps.datastore.bulkPut<typeof AnnouncementsDatastore.definition>({
          datastore: DATASTORE,
          items: records.slice(i, i + CHUNK),
        });
        if (!resp.ok) throw new Error(`Datastore write failed: ${resp.error}`);
      }
    },
  };
}

function slackPoster(client: SlackAPIClient) {
  return async (channel: string, text: string) => {
    const resp = await client.chat.postMessage({ channel, text, unfurl_links: false, unfurl_media: false });
    if (!resp.ok) throw new Error(`Posting to ${channel} failed: ${resp.error}`);
  };
}

export default SlackFunction(PollResultsFunction, async ({ inputs, client }) => {
  const fetchPage = makeFetchPage(USER_AGENT, BASE_URL);
  const post = slackPoster(client);
  try {
    if (inputs.mode === "sample") {
      let posted = 0;
      for (const { event, chapter, kind } of await latestSamples(fetchPage)) {
        const text = buildMessage(event, chapter, kind);
        if (text) {
          await post(DEFAULT_CHANNEL, text);
          posted++;
        }
      }
      return { outputs: { posted } };
    }
    const summary = await pollOnce({ fetchPage, post, store: slackStore(client) });
    return { outputs: { posted: summary.posted } };
  } catch (err) {
    console.error(err);
    return { error: `Velocio couldn't finish this run: ${err instanceof Error ? err.message : err}` };
  }
});
