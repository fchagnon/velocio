import { TriggerTypes } from "deno-slack-api/mod.ts";
import type { Trigger } from "deno-slack-api/types.ts";
import { PollResultsWorkflow } from "../workflows/poll_results.ts";

/**
 * Runs Velocio's check every hour (the shortest interval Slack schedules allow),
 * starting a minute after the trigger is created. Create it once with:
 *   slack trigger create --trigger-def triggers/every_hour.ts
 */
const trigger: Trigger<typeof PollResultsWorkflow.definition> = {
  type: TriggerTypes.Scheduled,
  name: "Check results every hour",
  workflow: `#/workflows/${PollResultsWorkflow.definition.callback_id}`,
  inputs: {},
  schedule: {
    start_time: new Date(Date.now() + 60_000).toISOString(),
    frequency: { type: "hourly", repeats_every: 1 },
  },
};

export default trigger;
