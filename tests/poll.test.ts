import { pollOnce } from "../lib/poll.ts";
import { channelFor, setPicker } from "../lib/messages.ts";
import { assert, assertEquals, ev, harness, page } from "./helpers.ts";

setPicker((list) => list[0]);

const OLD = ev("Crepe 200", "huron", "September 8, 2026", 200, [["Robert Smith", "9:54"]]);

Deno.test("permanents: first run is silent, then new finishes post, PENDING waits", async () => {
  const offRails = ev("Off the Rails", "huron", "September 30, 2026", 200, [["Fred Chagnon", "9:24"]]);
  const pages: Record<string, string> = { permanent: page(offRails), huron: page(OLD) };
  const h = harness(pages, new Date("2026-10-02T12:00:00Z"));

  const first = await pollOnce(h.deps);
  assert(first.seededPermanents && first.seededBrevets);
  assertEquals(h.posts.length, 0);

  pages.permanent = page(ev("Sandhills", "huron", "October 1, 2026", 200, [["Rei Kawamura", "PENDING"]]), offRails);
  await pollOnce(h.deps);
  assertEquals(h.posts.length, 0, "PENDING permanent must not post");

  pages.permanent = page(ev("Sandhills", "huron", "October 1, 2026", 200, [["Rei Kawamura", "9:08"]]), offRails);
  await pollOnce(h.deps);
  assertEquals(h.posts.length, 0, "must wait for the cutoff");

  h.advance(7); // past the Oct 1 cutoff
  await pollOnce(h.deps);
  assertEquals(h.posts.length, 1);
  assert(h.posts[0].text.includes("Rei Kawamura") && h.posts[0].text.includes("9:08"), h.posts[0].text);
  assertEquals(h.posts[0].channel, channelFor("huron"));

  await pollOnce(h.deps);
  assertEquals(h.posts.length, 1, "no repeats");
});

Deno.test("permanents: two riders on one permanent get one group post", async () => {
  const pages: Record<string, string> = { permanent: page(OLD), huron: page(OLD) };
  const h = harness(pages, new Date("2026-10-02T12:00:00Z"));
  await pollOnce(h.deps);
  pages.permanent = page(
    ev("Mean Streets", "toronto", "October 1, 2026", 200, [["Italo Bravo", "13:13"], ["Kourosh Alasvand", "12:41"]]),
    OLD,
  );
  h.advance(7);
  await pollOnce(h.deps);
  assertEquals(h.posts.length, 1);
  assert(h.posts[0].text.includes("2 riders started, 2 finished."), h.posts[0].text);
});

Deno.test("permanents: a ridemate still PENDING holds the post until everyone is in", async () => {
  const pages: Record<string, string> = { permanent: page(OLD), huron: page(OLD) };
  const h = harness(pages, new Date("2026-10-24T12:00:00Z"));
  await pollOnce(h.deps);
  const ride = (karl: string) =>
    page(ev("Queen's Bush", "huron", "October 25, 2026", 200, [["Rei Kawamura", "9:46"], ["Karl Caris", karl]]), OLD);

  h.clock.t = new Date("2026-10-27T12:00:00Z"); // past the cutoff
  pages.permanent = ride("PENDING");
  await pollOnce(h.deps);
  assertEquals(h.posts.length, 0, "Rei waits for Karl");

  pages.permanent = ride("9:46");
  h.advance(1);
  await pollOnce(h.deps);
  assertEquals(h.posts.length, 1);
  assert(h.posts[0].text.includes("2 riders started, 2 finished."), h.posts[0].text);

  h.advance(1);
  await pollOnce(h.deps);
  assertEquals(h.posts.length, 1, "no repeats");
});

Deno.test("permanents: a late submitter after an announcement gets their own post", async () => {
  const pages: Record<string, string> = { permanent: page(OLD), huron: page(OLD) };
  const h = harness(pages, new Date("2026-10-24T12:00:00Z"));
  await pollOnce(h.deps);
  h.clock.t = new Date("2026-10-27T12:00:00Z");
  pages.permanent = page(ev("Queen's Bush", "huron", "October 25, 2026", 200, [["Rei Kawamura", "9:46"]]), OLD);
  await pollOnce(h.deps);
  assertEquals(h.posts.length, 1);
  pages.permanent = page(
    ev("Queen's Bush", "huron", "October 25, 2026", 200, [["Rei Kawamura", "9:46"], ["Karl Caris", "9:46"]]),
    OLD,
  );
  await pollOnce(h.deps);
  assertEquals(h.posts.length, 2);
  assert(h.posts[1].text.includes("Karl Caris") && !h.posts[1].text.includes("Rei Kawamura"), h.posts[1].text);
});

Deno.test("brevets: a 600 waits for settle time, cutoff and stragglers, then posts once", async () => {
  const pages: Record<string, string> = { permanent: page(OLD), huron: page(OLD) };
  // Seed before the ride.
  const h = harness(pages, new Date("2026-10-03T10:00:00Z"));
  await pollOnce(h.deps);

  const ride = (riders: Array<[string, string]>) =>
    page(ev("Lake Huron 600", "huron", "October 3, 2026", 600, riders), OLD);

  // Sunday 18:00 Toronto: a fast rider submits mid-ride.
  h.clock.t = new Date("2026-10-04T22:00:00Z");
  pages.huron = ride([["Michel Hebert", "34:10"]]);
  await pollOnce(h.deps);
  assertEquals(h.posts.length, 0);

  h.advance(13); // settle time passed, cutoff not yet
  await pollOnce(h.deps);
  assertEquals(h.posts.length, 0, "must wait for the cutoff");

  h.advance(16); // cutoff passed; stragglers now PENDING
  pages.huron = ride([["Michel Hebert", "34:10"], ["Karl Caris", "38:02"], ["Rei Kawamura", "PENDING"]]);
  await pollOnce(h.deps);
  assertEquals(h.posts.length, 0, "PENDING riders block the post");

  h.advance(5);
  pages.huron = ride([["Michel Hebert", "34:10"], ["Karl Caris", "38:02"], ["Rei Kawamura", "DNF"]]);
  await pollOnce(h.deps);
  assertEquals(h.posts.length, 1);
  const text = h.posts[0].text;
  assert(text.indexOf("Karl Caris") < text.indexOf("Michel Hebert"), text);
  assert(text.indexOf("Michel Hebert") < text.indexOf("Rei Kawamura"), text);
  assert(text.includes("Rei Kawamura>, DNF"), text);

  h.advance(1);
  await pollOnce(h.deps);
  assertEquals(h.posts.length, 1, "announced once only");
});

Deno.test("brevets: a lone DNF is recorded but not posted", async () => {
  const pages: Record<string, string> = { permanent: page(OLD), huron: page(OLD) };
  const h = harness(pages, new Date("2026-09-06T12:00:00Z"));
  await pollOnce(h.deps);
  pages.huron = page(ev("Hotcake 300", "huron", "September 7, 2026", 300, [["Dija Amer", "DNF"]]), OLD);
  await pollOnce(h.deps);
  h.advance(72);
  await pollOnce(h.deps);
  assertEquals(h.posts.length, 0);
  const rec = [...h.store.records.values()].find((r) => r.key.includes("hotcake"));
  assertEquals(rec?.announced, true);
});

Deno.test("a failed Slack post is retried on the next run", async () => {
  const pages: Record<string, string> = { permanent: page(OLD), huron: page(OLD) };
  const h = harness(pages, new Date("2026-10-02T12:00:00Z"));
  await pollOnce(h.deps);
  pages.permanent = page(ev("Sandhills", "huron", "October 1, 2026", 200, [["Rei Kawamura", "9:08"]]), OLD);
  h.advance(7); // past the cutoff, so a post is attempted
  const realPost = h.deps.post;
  h.deps.post = () => Promise.reject(new Error("slack down"));
  let threw = false;
  try {
    await pollOnce(h.deps);
  } catch {
    threw = true;
  }
  assert(threw);
  h.deps.post = realPost;
  await pollOnce(h.deps);
  assertEquals(h.posts.length, 1);
});
