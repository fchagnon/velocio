import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { PollResultsFunction } from "../functions/poll_results.ts";

/** Run on a schedule: check the results pages and announce anything new. */
export const PollResultsWorkflow = DefineWorkflow({
  callback_id: "poll_results_workflow",
  title: "Velocio: check results",
  description: "Checks the club results pages and announces new finishes and completed events",
  input_parameters: { properties: {}, required: [] },
});
PollResultsWorkflow.addStep(PollResultsFunction, { mode: "poll" });

/** Run by hand from a link: post the latest results to the test channel. */
export const SamplePostWorkflow = DefineWorkflow({
  callback_id: "sample_post_workflow",
  title: "Velocio: post a sample",
  description: "Posts the latest permanent and group brevet to the test channel",
  input_parameters: {
    properties: { interactivity: { type: Schema.slack.types.interactivity } },
    required: [],
  },
});
SamplePostWorkflow.addStep(PollResultsFunction, { mode: "sample" });
