import assert from "node:assert/strict";
import test from "node:test";
import {
  candidateSitemapUrls,
  discoverRoutes,
  makeFetchText,
  normalizeRoute,
  resolveSitemapUrl,
  tryDiscoverRoutes,
} from "../src/sitemap.js";

const BASE = "https://site.example.com";

// A fake fetcher keyed by URL — no network in unit tests.
function fetcher(pages: Record<string, string>) {
  return async (url: string) => {
    const body = pages[url];
    if (body === undefined) throw new Error(`unexpected fetch ${url}`);
    return body;
  };
}

test("resolveSitemapUrl derives the index from the base URL", () => {
  assert.equal(
    resolveSitemapUrl(true, BASE),
    "https://site.example.com/sitemap-index.xml",
  );
});

test("resolveSitemapUrl resolves a relative string against the base", () => {
  assert.equal(
    resolveSitemapUrl("/custom-sitemap.xml", BASE),
    "https://site.example.com/custom-sitemap.xml",
  );
});

test("a flat urlset yields sorted, relative, deduped routes", async () => {
  const xml = `<?xml version="1.0"?><urlset>
    <url><loc>${BASE}/solutions/construction/</loc></url>
    <url><loc>${BASE}/</loc></url>
    <url><loc>${BASE}/about/</loc></url>
    <url><loc>${BASE}/about/</loc></url>
  </urlset>`;
  const routes = await discoverRoutes({
    sitemap: "/sitemap.xml",
    baseUrl: BASE,
    fetchText: fetcher({ [`${BASE}/sitemap.xml`]: xml }),
  });
  assert.deepEqual(routes, ["/", "/about/", "/solutions/construction/"]);
});

test("a sitemap index fans out to child sitemaps", async () => {
  const index = `<?xml version="1.0"?><sitemapindex>
    <sitemap><loc>${BASE}/sitemap-0.xml</loc></sitemap>
  </sitemapindex>`;
  const child = `<?xml version="1.0"?><urlset>
    <url><loc>${BASE}/a/</loc></url>
    <url><loc>${BASE}/b/</loc></url>
  </urlset>`;
  const routes = await discoverRoutes({
    sitemap: true,
    baseUrl: BASE,
    fetchText: fetcher({
      [`${BASE}/sitemap-index.xml`]: index,
      [`${BASE}/sitemap-0.xml`]: child,
    }),
  });
  assert.deepEqual(routes, ["/a/", "/b/"]);
});

test("cross-origin locs are dropped", async () => {
  const xml = `<?xml version="1.0"?><urlset>
    <url><loc>${BASE}/keep/</loc></url>
    <url><loc>https://cdn.other.com/drop/</loc></url>
  </urlset>`;
  const routes = await discoverRoutes({
    sitemap: "/s.xml",
    baseUrl: BASE,
    fetchText: fetcher({ [`${BASE}/s.xml`]: xml }),
  });
  assert.deepEqual(routes, ["/keep/"]);
});

test("trailing-slash variants collapse to one route", async () => {
  const xml = `<?xml version="1.0"?><urlset>
    <url><loc>${BASE}/about</loc></url>
    <url><loc>${BASE}/about/</loc></url>
  </urlset>`;
  const routes = await discoverRoutes({
    sitemap: "/s.xml",
    baseUrl: BASE,
    fetchText: fetcher({ [`${BASE}/s.xml`]: xml }),
  });
  assert.deepEqual(routes, ["/about/"]);
});

test("www and apex hosts count as the same site", async () => {
  // Site configured by apex; sitemap lists the canonical www host.
  const apex = "https://example.com";
  const xml = `<?xml version="1.0"?><urlset>
    <url><loc>https://www.example.com/keep/</loc></url>
    <url><loc>https://cdn.other.com/drop/</loc></url>
  </urlset>`;
  const routes = await discoverRoutes({
    sitemap: "/s.xml",
    baseUrl: apex,
    fetchText: fetcher({ [`${apex}/s.xml`]: xml }),
  });
  assert.deepEqual(routes, ["/keep/"]);
});

test("normalizeRoute collapses trailing-slash variants and leaves root", () => {
  assert.equal(normalizeRoute("/about"), "/about/");
  assert.equal(normalizeRoute("/about/"), "/about/");
  assert.equal(normalizeRoute("/"), "/");
  assert.equal(normalizeRoute(""), "/");
});

test("normalizeRoute adds a leading slash to a bare config route", () => {
  // A user may write "about" (no slash) in config.routes/--affected; it must
  // collapse to the same "/about/" discovery produces, not a distinct "about/".
  assert.equal(normalizeRoute("about"), "/about/");
  assert.equal(normalizeRoute("about/"), "/about/");
  assert.equal(normalizeRoute("blog/post"), "/blog/post/");
});

test("alsoAcceptHost keeps preview pages listed under the production host", async () => {
  // Preview deploy at pr-5.preview.app whose sitemap was generated with the
  // production base, so every <loc> is a www.example.com URL — including a
  // page that only exists in the preview.
  const preview = "https://pr-5.preview.app";
  const xml = `<?xml version="1.0"?><urlset>
    <url><loc>https://www.example.com/</loc></url>
    <url><loc>https://www.example.com/new-page/</loc></url>
  </urlset>`;
  const routes = await discoverRoutes({
    sitemap: "/s.xml",
    baseUrl: preview,
    alsoAcceptHost: "example.com",
    fetchText: fetcher({ [`${preview}/s.xml`]: xml }),
  });
  assert.deepEqual(routes, ["/", "/new-page/"]);
});

test("without alsoAcceptHost, production-host locs on a preview are dropped", async () => {
  const preview = "https://pr-5.preview.app";
  const xml = `<?xml version="1.0"?><urlset>
    <url><loc>https://www.example.com/only/</loc></url>
  </urlset>`;
  const routes = await discoverRoutes({
    sitemap: "/s.xml",
    baseUrl: preview,
    fetchText: fetcher({ [`${preview}/s.xml`]: xml }),
  });
  assert.deepEqual(routes, []);
});

test("a sitemap index child on a foreign host is not fetched (SSRF guard)", async () => {
  const index = `<?xml version="1.0"?><sitemapindex>
    <sitemap><loc>${BASE}/good.xml</loc></sitemap>
    <sitemap><loc>http://169.254.169.254/latest/meta-data/</loc></sitemap>
    <sitemap><loc>https://evil.example.org/steal.xml</loc></sitemap>
  </sitemapindex>`;
  const good = `<?xml version="1.0"?><urlset><url><loc>${BASE}/ok/</loc></url></urlset>`;
  const fetched: string[] = [];
  const routes = await discoverRoutes({
    sitemap: "/s.xml",
    baseUrl: BASE,
    fetchText: async (url: string) => {
      fetched.push(url);
      if (url === `${BASE}/s.xml`) return index;
      if (url === `${BASE}/good.xml`) return good;
      throw new Error(`unexpected fetch ${url}`);
    },
  });
  assert.deepEqual(routes, ["/ok/"]);
  // The foreign-host children were never requested.
  assert.deepEqual(fetched, [`${BASE}/s.xml`, `${BASE}/good.xml`]);
});

test("a preview index's production-host children are fetched from the preview", async () => {
  // Preview at pr-5.preview.app; its index lists child sitemaps under the
  // production host. We must fetch the children from the PREVIEW host (so we
  // read the preview's routes), and keep production-canonical <loc>s via
  // alsoAcceptHost.
  const preview = "https://pr-5.preview.app";
  const index = `<?xml version="1.0"?><sitemapindex>
    <sitemap><loc>https://www.example.com/sitemap-0.xml</loc></sitemap>
  </sitemapindex>`;
  const child = `<?xml version="1.0"?><urlset>
    <url><loc>https://www.example.com/preview-only/</loc></url>
  </urlset>`;
  const fetched: string[] = [];
  const routes = await discoverRoutes({
    sitemap: "/sitemap.xml",
    baseUrl: preview,
    alsoAcceptHost: "example.com",
    fetchText: async (url: string) => {
      fetched.push(url);
      if (url === `${preview}/sitemap.xml`) return index;
      if (url === `${preview}/sitemap-0.xml`) return child;
      throw new Error(`unexpected fetch ${url}`);
    },
  });
  assert.deepEqual(routes, ["/preview-only/"]);
  // The child was requested from the preview host, not www.example.com.
  assert.ok(fetched.includes(`${preview}/sitemap-0.xml`));
  assert.ok(!fetched.some((u) => u.includes("www.example.com")));
});

test("makeFetchText rejects a redirect that lands on an untrusted host", async () => {
  const allowed = new Set(["example.com"]);
  const fetchXml = makeFetchText(allowed);
  const realFetch = globalThis.fetch;
  // Simulate a 200 whose final URL (after following redirects) is internal.
  globalThis.fetch = (async () =>
    new Response("<urlset/>", {
      status: 200,
      headers: { "content-type": "application/xml" },
    })) as typeof fetch;
  // Response.url is empty in the polyfill above; force it via a subclass.
  globalThis.fetch = (async () => {
    const r = new Response("<urlset/>", { status: 200 });
    Object.defineProperty(r, "url", { value: "http://169.254.169.254/" });
    return r;
  }) as typeof fetch;
  try {
    await assert.rejects(
      () => fetchXml("https://example.com/sitemap.xml"),
      /untrusted host/,
    );
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("makeFetchText accepts a redirect that stays on an allowed host", async () => {
  const allowed = new Set(["example.com"]);
  const fetchXml = makeFetchText(allowed);
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    const r = new Response("<urlset><url><loc>x</loc></url></urlset>", {
      status: 200,
    });
    // http→https on the same site is a normal, allowed redirect.
    Object.defineProperty(r, "url", { value: "https://www.example.com/s.xml" });
    return r;
  }) as typeof fetch;
  try {
    const body = await fetchXml("http://example.com/s.xml");
    assert.match(body, /urlset/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("discovery stops fetching children once the deadline passes", async () => {
  const index = `<?xml version="1.0"?><sitemapindex>
    <sitemap><loc>${BASE}/a.xml</loc></sitemap>
    <sitemap><loc>${BASE}/b.xml</loc></sitemap>
    <sitemap><loc>${BASE}/c.xml</loc></sitemap>
  </sitemapindex>`;
  const child = (n: string) =>
    `<?xml version="1.0"?><urlset><url><loc>${BASE}/${n}/</loc></url></urlset>`;
  const notices: string[] = [];
  let clock = 0;
  const fetched: string[] = [];
  const routes = await discoverRoutes({
    sitemap: "/s.xml",
    baseUrl: BASE,
    now: () => clock,
    onNotice: (m) => notices.push(m),
    fetchText: async (url: string) => {
      if (url === `${BASE}/s.xml`) return index;
      fetched.push(url);
      clock += 20_000; // each child fetch advances the clock 20s
      if (url === `${BASE}/a.xml`) return child("a");
      if (url === `${BASE}/b.xml`) return child("b");
      return child("c");
    },
  });
  // First child fetched (clock 0), advances to 20s; second still under 30s
  // deadline, advances to 40s; third is skipped.
  assert.deepEqual(fetched, [`${BASE}/a.xml`, `${BASE}/b.xml`]);
  assert.deepEqual(routes, ["/a/", "/b/"]);
  assert.ok(notices.some((n) => /deadline reached/.test(n)));
});

test("discovery caps total routes and notices the drop", async () => {
  const locs = Array.from(
    { length: 2_500 },
    (_, i) => `<url><loc>${BASE}/p-${i}/</loc></url>`,
  ).join("");
  const xml = `<?xml version="1.0"?><urlset>${locs}</urlset>`;
  const notices: string[] = [];
  const routes = await discoverRoutes({
    sitemap: "/s.xml",
    baseUrl: BASE,
    onNotice: (m) => notices.push(m),
    fetchText: fetcher({ [`${BASE}/s.xml`]: xml }),
  });
  assert.equal(routes.length, 2_000);
  assert.ok(notices.some((n) => /capping at 2000/.test(n)));
});

test("a huge sitemap index is capped at 50 child fetches", async () => {
  const children = Array.from(
    { length: 200 },
    (_, i) => `<sitemap><loc>${BASE}/s-${i}.xml</loc></sitemap>`,
  ).join("");
  const index = `<?xml version="1.0"?><sitemapindex>${children}</sitemapindex>`;
  let childFetches = 0;
  await discoverRoutes({
    sitemap: "/s.xml",
    baseUrl: BASE,
    fetchText: async (url: string) => {
      if (url === `${BASE}/s.xml`) return index;
      childFetches++;
      return `<?xml version="1.0"?><urlset><url><loc>${url}</loc></url></urlset>`;
    },
  });
  assert.equal(childFetches, 50);
});

test("an unreachable child sitemap doesn't sink the run", async () => {
  const index = `<?xml version="1.0"?><sitemapindex>
    <sitemap><loc>${BASE}/good.xml</loc></sitemap>
    <sitemap><loc>${BASE}/bad.xml</loc></sitemap>
  </sitemapindex>`;
  const good = `<?xml version="1.0"?><urlset><url><loc>${BASE}/ok/</loc></url></urlset>`;
  const routes = await discoverRoutes({
    sitemap: true,
    baseUrl: BASE,
    fetchText: async (url: string) => {
      if (url === `${BASE}/sitemap-index.xml`) return index;
      if (url === `${BASE}/good.xml`) return good;
      throw new Error("404");
    },
  });
  assert.deepEqual(routes, ["/ok/"]);
});

test("auto-derive falls back to /sitemap.xml when the index 404s", async () => {
  const flat = `<?xml version="1.0"?><urlset><url><loc>${BASE}/p/</loc></url></urlset>`;
  const routes = await discoverRoutes({
    sitemap: true,
    baseUrl: BASE,
    fetchText: async (url: string) => {
      if (url === `${BASE}/sitemap.xml`) return flat;
      throw new Error("HTTP 404");
    },
  });
  assert.deepEqual(routes, ["/p/"]);
});

test("candidateSitemapUrls lists index then flat", () => {
  assert.deepEqual(candidateSitemapUrls(BASE), [
    `${BASE}/sitemap-index.xml`,
    `${BASE}/sitemap.xml`,
    `${BASE}/sitemap_index.xml`,
  ]);
});

test("tryDiscoverRoutes returns found:false when no sitemap exists", async () => {
  const result = await tryDiscoverRoutes({
    sitemap: true,
    baseUrl: BASE,
    fetchText: async () => {
      throw new Error("HTTP 404");
    },
  });
  assert.equal(result.found, false);
  assert.deepEqual(result.routes, []);
  assert.match(result.reason ?? "", /404/);
});

test("tryDiscoverRoutes returns found:true with routes on success", async () => {
  const xml = `<?xml version="1.0"?><urlset><url><loc>${BASE}/x/</loc></url></urlset>`;
  const result = await tryDiscoverRoutes({
    sitemap: "/s.xml",
    baseUrl: BASE,
    fetchText: fetcher({ [`${BASE}/s.xml`]: xml }),
  });
  assert.equal(result.found, true);
  assert.deepEqual(result.routes, ["/x/"]);
});
