/**
 * Sitemap route discovery. When a config sets `sitemap`, gist derives the list
 * of routes to capture from the site's published sitemap instead of a
 * hand-maintained `routes` array — so a review covers every page the site
 * ships, not just the ones someone remembered to list.
 *
 * Handles both a flat `<urlset>` and a `<sitemapindex>` that fans out to
 * child sitemaps (Astro, Next, and most generators emit an index once a site
 * passes ~a few dozen URLs). One level of index nesting is followed; deeper
 * nesting is rare and not worth the complexity.
 */

/**
 * How route discovery is configured — the three-state sitemap mode used by the
 * config, the CLI, and the run path:
 *   `true`   → derive the sitemap URL from the base URL (try the well-known names)
 *   string   → an explicit sitemap URL (or path, resolved against the base)
 *   `false`  → discovery disabled; capture only the configured `routes`
 */
export type SitemapMode = true | string | false;

/** The discovery-active subset of {@link SitemapMode} (everything but `false`). */
export type ActiveSitemapMode = true | string;

/** Extract the text of every `<loc>` element in a sitemap XML document. */
function extractLocs(xml: string): string[] {
  const out: string[] = [];
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    out.push(decodeXmlEntities(m[1]!));
  }
  return out;
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/** True when the document is a sitemap index (points at other sitemaps). */
function isIndex(xml: string): boolean {
  return /<sitemapindex[\s>]/i.test(xml);
}

/**
 * Upper bound on child sitemaps fetched from an index. Real sites split into a
 * handful of children (posts, pages, products); anything past this is either
 * pathological or hostile, and we'd rather cap coverage than fan out unbounded.
 */
const MAX_INDEX_CHILDREN = 50;

/**
 * Overall wall-clock budget for one site's discovery. Child sitemaps are
 * fetched sequentially and each can stall up to SITEMAP_FETCH_TIMEOUT_MS, so
 * without this the worst case is MAX_INDEX_CHILDREN × that timeout (~500s). Once
 * the deadline passes we stop fetching more children and use what we have.
 */
const DISCOVERY_DEADLINE_MS = 30_000;

/**
 * Upper bound on total routes returned. A pathological or hostile sitemap
 * listing tens of thousands of URLs would otherwise turn into that many browser
 * captures downstream. Past this we stop and log how many were dropped.
 */
const MAX_ROUTES = 2_000;

/**
 * Guard for a sitemap-index child URL before we fetch it. The index is
 * attacker-influenceable, so a child is only followed when it parses as
 * http(s) and sits on a host we already trust — never an arbitrary internal
 * address (SSRF) or an external domain.
 */
function isAllowedSitemapChild(loc: string, allowedHosts: Set<string>): boolean {
  let u: URL;
  try {
    u = new URL(loc);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  return allowedHosts.has(canonicalHost(u.hostname));
}

/**
 * Collapse a host to its registrable form for comparison: strip a leading
 * `www.`. Sitemaps routinely list the canonical host (`www.example.com`) even
 * when the site is configured by its apex (`example.com`) or vice versa; those
 * are the same site and their pages must not be dropped.
 */
function canonicalHost(host: string): string {
  return host.replace(/^www\./i, "");
}

/**
 * Canonicalize a site-relative route so equivalent forms collapse to one.
 * "/about" and "/about/" are the same page and MUST normalize identically —
 * otherwise a union carries duplicates, their screenshots (which share a slug)
 * overwrite each other, and an `--affected /about` won't match a discovered
 * "/about/". The trailing slash is the canonical form; the root "/" is left
 * as-is. Shared by sitemap discovery AND the config/affected route paths so
 * every route in a run passes through the exact same rule.
 */
export function normalizeRoute(route: string): string {
  if (route === "" || route === "/") return "/";
  // A config/affected route may be written without a leading slash ("about");
  // discovery always yields one ("/about/"). Force the slash so the two forms
  // collapse instead of surviving as distinct routes.
  const withLead = route.startsWith("/") ? route : `/${route}`;
  return withLead.endsWith("/") ? withLead : `${withLead}/`;
}

/**
 * Turn an absolute URL into a normalized, site-relative route ("/a/b/"), or
 * null if it isn't a URL on an allowed host.
 */
function toRoute(loc: string, allowedHosts: Set<string>): string | null {
  let u: URL;
  try {
    u = new URL(loc);
  } catch {
    return null;
  }
  // Keep only same-site URLs — an external CDN listed in the sitemap would
  // poison the run. `www.` is treated as the same site as the apex, and a
  // preview run also accepts the production host (see `alsoAcceptHost`).
  if (!allowedHosts.has(canonicalHost(u.hostname))) return null;
  return normalizeRoute(u.pathname);
}

/** Abort a sitemap fetch that stalls, so a hung host can't freeze `gist run`. */
const SITEMAP_FETCH_TIMEOUT_MS = 10_000;

/**
 * Build the real network fetcher, bound to the hosts we trust. Redirects are
 * followed (sitemaps legitimately redirect http→https or /sitemap.xml→an
 * index), but the FINAL landing host is re-validated: a `<loc>` on an allowed
 * host that 302s to an internal address (SSRF) is rejected once we see where
 * it actually resolved.
 */
export function makeFetchText(
  allowedHosts: Set<string>,
): (url: string) => Promise<string> {
  return async (url: string): Promise<string> => {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(SITEMAP_FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`sitemap fetch ${url} → HTTP ${res.status}`);
    // Where did we actually land? Reject a redirect that escaped to an
    // untrusted host before reading the body.
    let finalHost: string;
    try {
      finalHost = canonicalHost(new URL(res.url).hostname);
    } catch {
      throw new Error(`sitemap fetch ${url} → unparseable final URL ${res.url}`);
    }
    if (!allowedHosts.has(finalHost)) {
      throw new Error(
        `sitemap fetch ${url} → redirected to untrusted host ${finalHost}`,
      );
    }
    return res.text();
  };
}

/**
 * Candidate sitemap URLs to try when auto-deriving (`sitemap: true`). Different
 * generators emit different names — Astro/Next favour an index, hand-rolled
 * sites a flat `sitemap.xml`. Tried in order; first that fetches wins.
 */
export function candidateSitemapUrls(baseUrl: string): string[] {
  return [
    new URL("/sitemap-index.xml", baseUrl).toString(),
    new URL("/sitemap.xml", baseUrl).toString(),
    new URL("/sitemap_index.xml", baseUrl).toString(),
  ];
}

/** Fetch the first URL in the list that succeeds; throw if none do. */
async function fetchFirst(
  urls: string[],
  fetchXml: (url: string) => Promise<string>,
): Promise<string> {
  let lastErr: unknown;
  for (const url of urls) {
    try {
      return await fetchXml(url);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr ?? new Error("no sitemap candidates to try");
}

/**
 * Resolve the sitemap URL from a config value. `true` → derive from the base
 * URL (first candidate); a string → use it verbatim (relative strings resolve
 * against the base).
 */
export function resolveSitemapUrl(
  sitemap: ActiveSitemapMode,
  baseUrl: string,
): string {
  if (sitemap === true) return candidateSitemapUrls(baseUrl)[0]!;
  return new URL(sitemap, baseUrl).toString();
}

export interface DiscoverOptions {
  /** Sitemap config value: true (derive) or an explicit URL/path. */
  sitemap: ActiveSitemapMode;
  /** Site origin routes must belong to — usually the production/base URL. */
  baseUrl: string;
  /**
   * Extra host to accept `<loc>` entries from, beyond the one derived from
   * `baseUrl`. Used for preview discovery: a preview deploy's sitemap is often
   * generated with the *production* base, so it lists production-canonical URLs
   * even though we fetched it from the preview host. Without this, every entry
   * would be rejected as cross-site and preview-only pages would be lost.
   */
  alsoAcceptHost?: string;
  /** Fetch override, for tests. Defaults to a real network fetch. */
  fetchText?: (url: string) => Promise<string>;
  /** Notice sink for skipped work (deadline hit, route cap). Optional. */
  onNotice?: (message: string) => void;
  /** Monotonic clock, injectable for deterministic tests. Defaults to Date.now. */
  now?: () => number;
}

/**
 * Discover all same-origin routes from a site's sitemap, deduplicated and
 * sorted. Returns relative paths ("/", "/solutions/construction/"). Falls back
 * gracefully: an index that lists no reachable child sitemaps yields whatever
 * `<loc>`s the index itself carried.
 */
interface IndexFetchCtx {
  fetchXml: (url: string) => Promise<string>;
  allowedHosts: Set<string>;
  fetchHost: string;
  deadline: number;
  now: () => number;
  notice: (message: string) => void;
}

/**
 * Fetch the child sitemaps named by an index and return their `<loc>`s. A
 * sitemap index is attacker-influenceable, so children are bounded: only
 * allowed-host children (SSRF), capped at MAX_INDEX_CHILDREN, and fetching
 * stops once the overall deadline passes.
 */
async function collectIndexLocs(
  root: string,
  ctx: IndexFetchCtx,
): Promise<string[]> {
  const children = extractLocs(root)
    .filter((c) => isAllowedSitemapChild(c, ctx.allowedHosts))
    .slice(0, MAX_INDEX_CHILDREN);
  const locs: string[] = [];
  let fetched = 0;
  for (const child of children) {
    if (ctx.now() >= ctx.deadline) {
      ctx.notice(
        `sitemap discovery deadline reached — skipped ${children.length - fetched} of ${children.length} child sitemap(s)`,
      );
      break;
    }
    fetched++;
    try {
      // A preview index often lists child sitemaps under the PRODUCTION host
      // (the sitemap was built with the production base). Fetching those
      // verbatim would read production's routes, not the preview's — losing
      // preview-only pages. Rewrite each child onto the host we fetched the
      // index from so we read the right site's children.
      locs.push(...extractLocs(await ctx.fetchXml(rehost(child, ctx.fetchHost))));
    } catch {
      // A single unreachable child sitemap shouldn't sink the whole run —
      // capture what the others provide.
    }
  }
  return locs;
}

export async function discoverRoutes(opts: DiscoverOptions): Promise<string[]> {
  // Hosts whose pages we keep. Canonicalized (www-stripped) so www/apex match.
  const allowedHosts = new Set([canonicalHost(new URL(opts.baseUrl).hostname)]);
  if (opts.alsoAcceptHost) {
    allowedHosts.add(canonicalHost(new URL(`https://${opts.alsoAcceptHost}`).hostname));
  }
  const fetchXml = opts.fetchText ?? makeFetchText(allowedHosts);
  const notice = opts.onNotice ?? (() => {});
  const now = opts.now ?? (() => Date.now());
  const deadline = now() + DISCOVERY_DEADLINE_MS;

  // The host we actually fetch the index/sitemap from. On a preview run this is
  // the preview host even though `<loc>`s inside may carry the production host.
  const fetchHost = new URL(opts.baseUrl).hostname;

  // For an explicit URL, fetch it directly (and let a failure throw). For
  // auto-derive (`true`), try the well-known names in order until one fetches.
  let root: string;
  if (opts.sitemap === true) {
    root = await fetchFirst(candidateSitemapUrls(opts.baseUrl), fetchXml);
  } else {
    root = await fetchXml(resolveSitemapUrl(opts.sitemap, opts.baseUrl));
  }
  const locs = isIndex(root)
    ? await collectIndexLocs(root, {
        fetchXml,
        allowedHosts,
        fetchHost,
        deadline,
        now,
        notice,
      })
    : extractLocs(root);

  const routes = new Set<string>();
  for (const loc of locs) {
    const route = toRoute(loc, allowedHosts);
    if (route) routes.add(route);
  }
  const sorted = [...routes].sort();
  if (sorted.length > MAX_ROUTES) {
    notice(`sitemap yielded ${sorted.length} routes — capping at ${MAX_ROUTES}`);
    return sorted.slice(0, MAX_ROUTES);
  }
  return sorted;
}

/** Swap a URL's host for another, preserving path/query. Returns input on parse failure. */
function rehost(url: string, host: string): string {
  try {
    const u = new URL(url);
    u.hostname = host;
    return u.toString();
  } catch {
    return url;
  }
}

export interface TryDiscoverResult {
  /** Routes found, or [] when no usable sitemap exists. */
  routes: string[];
  /** True when a sitemap was fetched and parsed; false when none was found. */
  found: boolean;
  /** Present when discovery failed — a short reason for the log line. */
  reason?: string;
}

/**
 * Discovery that never throws — for the default path, where a site may simply
 * have no sitemap. Returns `{ found: false }` (with a reason) instead of
 * throwing, so the caller can fall back to explicit routes. A sitemap that
 * exists but lists zero same-origin routes counts as `found: true, routes: []`.
 */
export async function tryDiscoverRoutes(
  opts: DiscoverOptions,
): Promise<TryDiscoverResult> {
  try {
    const routes = await discoverRoutes(opts);
    return { routes, found: true };
  } catch (err) {
    return {
      routes: [],
      found: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}
