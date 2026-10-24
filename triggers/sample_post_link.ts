import { TriggerContextData, TriggerTypes } from "deno-slack-api/mod.ts";
import type { Trigger } from "deno-slack-api/types.ts";
import { SamplePostWorkflow } from "../workflows/poll_results.ts";

/**
 * A link you can click in Slack to make Velocio post the latest permanent and
 * group brevet to the test channel right away. Create it once with:
 *   slack trigger create --trigger-def triggers/sample_post_link.ts
 */
const trigger: Trigger<typeof SamplePostWorkflow.definition> = {
  type: TriggerTypes.Shortcut,
  name: "Velocio: post a sample",
  description: "Post the latest results to the test channel",
  workflow: `#/workflows/${SamplePostWorkflow.definition.callback_id}`,
  inputs: {
    interactivity: { value: TriggerContextData.Shortcut.interactivity },
  },
};

export default trigger;
