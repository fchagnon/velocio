import { DefineDatastore, Schema } from "deno-slack-sdk/mod.ts";

/**
 * Velocio's memory: every result or event he has seen, and whether it has
 * been announced. Replaces the local database file the Python version used.
 */
const AnnouncementsDatastore = DefineDatastore({
  name: "announcements",
  primary_key: "key",
  attributes: {
    key: { type: Schema.types.string },
    kind: { type: Schema.types.string }, // "permanent" or "brevet"
    first_seen: { type: Schema.types.string }, // ISO timestamp
    announced: { type: Schema.types.boolean },
    signature: { type: Schema.types.string },
  },
});

export default AnnouncementsDatastore;
