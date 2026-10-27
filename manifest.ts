import { RelayAwardsFunction } from "./functions/relay_awards.ts";
import RelayAwardsWorkflow from "./workflows/relay_awards.ts";
import { Manifest } from "deno-slack-sdk/mod.ts";
import AnnouncementsDatastore from "./datastores/announcements.ts";
import { PollResultsFunction } from "./functions/poll_results.ts";
import { PollResultsWorkflow, SamplePostWorkflow } from "./workflows/poll_results.ts";

export default Manifest({
  name: "Velocio",
  displayName: "Velocio",
  description: "Cheers on Randonneurs Ontario riders by announcing ride results",
  icon: "assets/icon.png",
  functions: [RelayAwardsFunction, PollResultsFunction],
  workflows: [RelayAwardsWorkflow, PollResultsWorkflow, SamplePostWorkflow],
  datastores: [AnnouncementsDatastore],
  outgoingDomains: ["www.randonneursontario.ca"],
  botScopes: [
    "commands",
    "chat:write",
    "chat:write.public",
    "datastore:read",
    "datastore:write",
  ],
});
