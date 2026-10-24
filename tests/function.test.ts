import { SlackFunctionTester } from "deno-slack-sdk/mod.ts";
import PollResults from "../functions/poll_results.ts";
import { setPicker } from "../lib/messages.ts";
import { assert, assertEquals, ev, page } from "./helpers.ts";

setPicker((list) => list[0]);
const { createContext } = SlackFunctionTester("poll_results");

/** A fake Slack API and club site, served through a stubbed fetch. */
function fakeWorld(sitePages: Record<string, string>) {
  const datastore = new Map<string, Record<string, unknown>>();
  const posts: Array<Record<string, string>> = [];
  const calls: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const req = input instanceof Request ? input : new Request(input, init);
    const url = new URL(req.url);
    if (url.hostname === "www.randonneursontario.ca") {
      const key = url.pathname.split("/").pop()!;
      return new Response(sitePages[key] ?? page());
    }
    const method = url.pathname.replace("/api/", "");
    calls.push(method);
    const body = Object.fromEntries((await req.formData()).entries()) as Record<string, string>;
    if (method === "apps.datastore.query") {
      return Response.json({ ok: true, items: [...datastore.values()], response_metadata: { next_cursor: "" } });
    }
    if (method === "apps.datastore.bulkPut") {
      for (const item of JSON.parse(body.items)) datastore.set(item.key, item);
      return Response.json({ ok: true });
    }
    if (method === "chat.postMessage") {
      posts.push(body);
      return Response.json({ ok: true });
    }
    return Response.json({ ok: false, error: `unexpected ${method}` });
  };
  return { datastore, posts, calls, restore: () => (globalThis.fetch = realFetch) };
}

Deno.test("function: seeds silently, then posts a new permanent through chat.postMessage", async () => {
  const pages: Record<string, string> = {
    permanent: page(ev("Off the Rails", "huron", "September 30, 2026", 200, [["Fred Chagnon", "9:24"]])),
    huron: page(ev("Crepe 200", "huron", "September 8, 2026", 200, [["Robert Smith", "9:54"]])),
  };
  const world = fakeWorld(pages);
  try {
    let result = await PollResults(createContext({ inputs: { mode: "poll" } }));
    assertEquals(result.error, undefined);
    assertEquals(world.posts.length, 0);
    assert(world.datastore.size === 2, `expected 2 records, got ${world.datastore.size}`);

    pages.permanent = page(
      ev("Sandhills", "huron", "October 1, 2026", 200, [["Rei Kawamura", "9:08"]]),
      ev("Off the Rails", "huron", "September 30, 2026", 200, [["Fred Chagnon", "9:24"]]),
    );
    result = await PollResults(createContext({ inputs: { mode: "poll" } }));
    assertEquals(result.error, undefined);
    assertEquals(result.outputs?.posted, 1);
    assertEquals(world.posts[0].channel, "#app-testing");
    assertEquals(world.posts[0].unfurl_links, "false");
    assert(world.posts[0].text.includes("Rei Kawamura"), world.posts[0].text);
  } finally {
    world.restore();
  }
});

Deno.test("function: sample mode posts the latest permanent and group brevet", async () => {
  const world = fakeWorld({
    permanent: page(ev("Off the Rails", "huron", "September 30, 2026", 200, [["Fred Chagnon", "9:24"]])),
    huron: page(ev("Griddlecake 1000", "huron", "September 5, 2026", 1000, [
      ["Fred Chagnon", "65:25"],
      ["Paul Young", "DNF"],
    ])),
  });
  try {
    const result = await PollResults(createContext({ inputs: { mode: "sample" } }));
    assertEquals(result.outputs?.posted, 2);
    assert(world.posts[1].text.includes("2 riders started, 1 finished."), world.posts[1].text);
    assert(!world.calls.includes("apps.datastore.bulkPut"), "sample mode must not touch memory");
  } finally {
    world.restore();
  }
});

Deno.test("function: a Slack error is reported, not swallowed", async () => {
  const world = fakeWorld({});
  globalThis.fetch = () => Promise.resolve(Response.json({ ok: false, error: "invalid_auth" }));
  try {
    const result = await PollResults(createContext({ inputs: { mode: "poll" } }));
    assert(result.error?.includes("invalid_auth") || result.error?.includes("Velocio couldn't"), String(result.error));
  } finally {
    world.restore();
  }
});
