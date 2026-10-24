import type { PollDeps, SeenRecord, Store } from "../lib/poll.ts";

export function assert(cond: unknown, msg = "assertion failed"): asserts cond {
  if (!cond) throw new Error(msg);
}

export function assertEquals<T>(actual: T, expected: T, msg = "") {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg}\n  expected: ${e}\n  actual:   ${a}`);
}

/** Builds a page shaped like the club site, including React's text splitting. */
export function page(...events: string[]): string {
  return `<html><body><nav><a href="/riders">Rider Directory</a></nav>
<main id="main-content"><h1>Results</h1>${events.join("")}</main>
<footer><h2>Ride</h2><a href="/riders">Rider Directory</a></footer>
<script>self.__next_f.push([1,"<h2><a href=\\"/routes/x/y\\">Fake</a></h2>"])</script></body></html>`;
}

export function ev(
  route: string,
  chapter: string,
  date: string,
  km: number,
  riders: Array<[string, string, string?]>,
): string {
  const lis = riders.map(([name, status, badge]) =>
    `<li><a href="/riders/${name.toLowerCase().replace(/[^a-z]+/g, "-")}">${name.replace("'", "&#x27;")}</a>` +
    `<span>${status}</span>${badge ? `<span>${badge}</span>` : ""}</li>`
  ).join("");
  return `<section><h2><a href="/routes/${chapter}/${route.toLowerCase().replace(/[^a-z0-9]+/g, "-")}">${route}</a></h2>` +
    `<p>${date}<!-- --> · <!-- -->${km}<!-- --> km · ${riders.length} riders</p><ul>${lis}</ul></section>`;
}

export class MemoryStore implements Store {
  records = new Map<string, SeenRecord>();
  all() {
    return Promise.resolve(new Map(this.records));
  }
  putMany(recs: SeenRecord[]) {
    recs.forEach((r) => this.records.set(r.key, { ...r }));
    return Promise.resolve();
  }
}

export function harness(pages: Record<string, string>, start: Date) {
  const posts: Array<{ channel: string; text: string }> = [];
  const clock = { t: start };
  const store = new MemoryStore();
  const deps: PollDeps = {
    fetchPage: (_y, p) => Promise.resolve(pages[p] ?? page()),
    post: (channel, text) => {
      posts.push({ channel, text });
      return Promise.resolve();
    },
    store,
    now: () => clock.t,
    log: () => {},
  };
  const advance = (hours: number) => (clock.t = new Date(clock.t.getTime() + hours * 3600_000));
  return { deps, posts, store, clock, advance };
}
