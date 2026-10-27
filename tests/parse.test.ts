import { PERMANENT_INVITE_CHANCE } from "../lib/config.ts";
import { parseResults } from "../lib/parse.ts";
import { buildMessage, setPicker, setRoller } from "../lib/messages.ts";
import { assert, assertEquals, ev, page } from "./helpers.ts";

setPicker((list) => list[0]);

Deno.test("parses events, riders, statuses and badges; ignores nav, footer and scripts", () => {
  const html = page(
    ev("Griddlecake 1000", "huron", "September 5, 2026", 1000, [
      ["Paul Young", "DNF"],
      ["Tim O'Callahan", "62:40", "First Brevet"],
      ["Philip De Vries", "PENDING"],
    ]),
    ev("Old Toronto", "toronto", "October 1, 2026", 53, [["Italo Bravo", "3:35"]]),
  );
  const events = parseResults(html);
  assertEquals(events.length, 2);
  const g = events[0];
  assertEquals([g.route, g.routeChapter, g.date, g.km], ["Griddlecake 1000", "huron", "September 5, 2026", 1000]);
  assertEquals(g.routeUrl, "https://www.randonneursontario.ca/routes/huron/griddlecake-1000");
  assertEquals(g.riders.map((r) => [r.name, r.status, r.badges]), [
    ["Paul Young", "DNF", []],
    ["Tim O'Callahan", "62:40", ["first brevet"]],
    ["Philip De Vries", "PENDING", []],
  ]);
  assertEquals(g.riders[0].url, "https://www.randonneursontario.ca/riders/paul-young");
});

Deno.test("group message sorts by last word of name and lists DNFs", () => {
  const [e] = parseResults(page(ev("Neustadt 200", "huron", "May 9, 2026", 200, [
    ["Philip De Vries", "9:10"],
    ["Corina Radoiu", "OTL"],
    ["Karl Caris", "9:12"],
  ])));
  const text = buildMessage(e, "huron", "brevet")!;
  const order = ["Karl Caris", "Corina Radoiu", "Philip De Vries"].map((n) => text.indexOf(`|${n}>`));
  assert(order.every((i, k) => i > 0 && (k === 0 || i > order[k - 1])), text);
  assert(text.includes("3 riders started, 2 finished."), text);
  assert(text.includes("Corina Radoiu>, OTL"), text);
});

Deno.test("solo finish gets a personal post with badge; solo DNF gets none", () => {
  const [win] = parseResults(page(ev("Original 200", "ottawa", "Sept 26, 2026", 200, [])));
  assertEquals(win, undefined); // no riders, no event
  const [solo] = parseResults(page(ev("Original 200", "ottawa", "September 26, 2026", 200, [
    ["Ben Maynard", "8:38", "First Brevet"],
  ])));
  const text = buildMessage(solo, "ottawa", "brevet")!;
  assert(text.startsWith(":tada: *Look who just finished a brevet!*"), text);
  assert(text.endsWith("first brevet, welcome to the club!"), text);
  const [dnf] = parseResults(page(ev("Hotcake 300", "huron", "September 7, 2026", 300, [["Dija Amer", "DNF"]])));
  assertEquals(buildMessage(dnf, "huron", "brevet"), null);
});

Deno.test("parses markup shaped like the site's real results component", () => {
  // Mirrors components/results-page.tsx as React renders it on the server.
  const html = `<div><main id="main-content"><article id="event-2026-09-12" class="scroll-mt-24">
<header class="mb-6"><h2 class="font-serif text-2xl md:text-3xl tracking-tight"><a class="hover:text-primary transition-colors" href="/routes/ottawa/agm-chenaux-200">AGM Chenaux 200</a></h2>
<p class="text-sm text-muted-foreground mt-1">September 12, 2026<!-- --> · 200 km · 3 riders</p></header>
<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-1">
<div class="flex items-center justify-between py-1.5 border-b border-border/50 group gap-2"><div class="flex flex-wrap items-center gap-x-1.5 gap-y-1 min-w-0"><a class="text-sm hover:text-primary transition-colors truncate" href="/riders/brieg-capitaine">Brieg Capitaine</a><span data-slot="tooltip-trigger" class="inline-flex items-center rounded-full px-2 text-xs shrink-0">First Brevet</span></div><span class="text-sm tabular-nums shrink-0 text-muted-foreground">9:53</span></div>
<div class="flex items-center justify-between py-1.5 border-b border-border/50 group gap-2"><div class="flex flex-wrap items-center gap-x-1.5 gap-y-1 min-w-0"><a class="text-sm hover:text-primary transition-colors truncate" href="/riders/peter-grant">Peter Grant</a></div><span class="text-sm tabular-nums shrink-0 text-muted-foreground/60">DNF</span></div>
<div class="flex items-center justify-between py-1.5 border-b border-border/50 group gap-2"><div class="flex flex-wrap items-center gap-x-1.5 gap-y-1 min-w-0"><a class="text-sm hover:text-primary transition-colors truncate" href="/riders/tim-o-callahan">Tim O&#x27;Callahan</a></div><span class="text-sm tabular-nums shrink-0 text-muted-foreground">DQ</span></div>
</div></article>
<article><header><h2 class="font-serif text-2xl">Flèche Destination: <!-- -->Kingston</h2><p>April 18, 2026 · 2 teams · 8 riders</p></header>
<div><h3 class="font-serif text-lg">Team Spoke</h3><a href="/riders/someone">Someone</a></div></article>
</main></div>`;
  const events = parseResults(html);
  assertEquals(events.length, 1, "flèche (no route link) is skipped");
  assertEquals(events[0].routeChapter, "ottawa");
  assertEquals(events[0].riders.map((r) => [r.name, r.status, r.badges]), [
    ["Brieg Capitaine", "9:53", ["first brevet"]],
    ["Peter Grant", "DNF", []],
    ["Tim O'Callahan", "DQ", []],
  ]);
});

Deno.test("posts name the ride type, and the permanent invite follows its setting", () => {
  const [perm] = parseResults(page(ev("Mean Streets", "toronto", "October 1, 2026", 200, [
    ["Italo Bravo", "13:13"],
    ["Kourosh Alasvand", "12:41"],
  ])));
  setRoller(() => 0); // invite included
  const p = buildMessage(perm, "toronto", "permanent")!;
  assert(p.includes("Mean Streets>* permanent"), p);
  assert(p.includes("Toronto route"), p);
  assert(p.includes("Register a permanent") === PERMANENT_INVITE_CHANCE > 0, p);
  setRoller(() => 0.99); // invite skipped
  assert(!buildMessage(perm, "toronto", "permanent")!.includes("Register a permanent"));

  const b = buildMessage(perm, "toronto", "brevet")!;
  assert(b.includes("Mean Streets>* brevet") && b.includes("Toronto chapter"), b);
  assert(!b.includes("Register a permanent"), b);

  const [pop] = parseResults(page(ev("Blini Populaire", "huron", "September 8, 2026", 80, [["Ken Jobba", "3:14"]])));
  const t = buildMessage(pop, "huron", "populaire")!;
  assert(t.includes("Blini Populaire>*") && !t.includes("Populaire>* populaire"), t);
  assert(!/\*[^*<]*\*<|>\*[^*]*\*!\*/.test(b), "no bold nested in bold");
});
