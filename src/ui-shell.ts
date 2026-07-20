/**
 * The single static HTML shell served at `/` by `gist ui`. It fetches
 * `/api/state`, then renders the PR list → runs → summary → per-page
 * annotated region panels (CSS-positioned into base/head PNGs) + full-page
 * before/after/diff. All client-side; the server only serves JSON + PNGs.
 */
export function renderShell(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Gist — website change review</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@700;800&display=swap" rel="stylesheet">
<style>
  :root {
    --bg: #fafaf8;
    --ink: #1a1a18;
    --muted: #6b6b66;
    --line: #e6e4de;
    --card: #ffffff;
    --green: #1a7f4b;
    --green-soft: #e6f4ec;
    --amber: #a05e03;
    --amber-soft: #fdf1dd;
    --red: #b3261e;
    --red-soft: #fbeae9;
    --mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    --display: "Figtree", system-ui, -apple-system, sans-serif;
  }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, -apple-system, sans-serif; font-size: 15px; line-height: 1.55; background: var(--bg); color: var(--ink); display: grid; grid-template-columns: 280px 1fr; height: 100vh; }
  aside { border-right: 1px solid var(--line); overflow-y: auto; background: var(--card); }
  aside h1 { font-family: var(--display); font-size: 1rem; font-weight: 800; letter-spacing: -.02em; padding: 1rem 1.25rem; margin: 0; border-bottom: 1px solid var(--line); color: var(--ink); }
  aside h1 .dot { color: var(--green); }
  .pr { border-bottom: 1px solid var(--line); }
  .pr > button { width: 100%; text-align: left; background: none; border: 0; color: inherit; padding: .75rem 1.25rem; cursor: pointer; font: inherit; }
  .pr > button:hover { background: var(--bg); }
  .pr .num { color: var(--muted); font-family: var(--mono); font-size: .72rem; }
  .pr .title { display: block; margin-top: .2rem; font-size: .85rem; font-weight: 600; }
  .runlist { list-style: none; margin: 0; padding: 0 0 .4rem; }
  .runlist li button { width: 100%; text-align: left; background: none; border: 0; color: var(--muted); padding: .3rem 1.25rem .3rem 2rem; cursor: pointer; font: inherit; font-size: .76rem; font-family: var(--mono); }
  .runlist li button:hover, .runlist li button.active { background: var(--bg); color: var(--ink); }
  main { overflow-y: auto; padding: 1.75rem 2.5rem 4rem; }
  .empty { color: var(--muted); margin-top: 3rem; text-align: center; }
  .totals { display: flex; gap: .5rem; flex-wrap: wrap; margin: .75rem 0 1.5rem; }
  .chip { padding: .3rem .75rem; border-radius: 9999px; font-size: .76rem; font-weight: 700; background: var(--bg); border: 1px solid var(--line); color: var(--muted); }
  .chip.warn { background: var(--amber-soft); color: var(--amber); border-color: transparent; }
  .chip.ok { background: var(--green-soft); color: var(--green); border-color: transparent; }
  .chip.muted { background: var(--bg); color: var(--muted); }
  .summary { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 1.25rem 1.5rem; margin-bottom: 1.75rem; line-height: 1.65; }
  .summary.missing { color: var(--muted); font-style: italic; }
  .summary h1, .summary h2, .summary h3 { font-family: var(--display); margin: .3rem 0 .5rem; letter-spacing: -.01em; }
  .run-title { font-family: var(--display); font-size: 1.4rem; font-weight: 800; letter-spacing: -.02em; margin: 0 0 .25rem; }
  /* Page card */
  .page { border: 1px solid var(--line); border-radius: 12px; margin-bottom: 1.75rem; overflow: hidden; background: var(--card); }
  .page header { display: flex; align-items: center; gap: .75rem; padding: .7rem 1rem; background: var(--bg); border-bottom: 1px solid var(--line); flex-wrap: wrap; }
  .page header .name { font-weight: 600; font-size: .9rem; }
  .page header .route { color: var(--muted); font-size: .76rem; font-family: var(--mono); }
  .badge { padding: .2rem .65rem; border-radius: 9999px; font-size: .7rem; font-weight: 700; }
  .badge.ok   { background: var(--green-soft); color: var(--green); }
  .badge.warn { background: var(--amber-soft); color: var(--amber); }
  .badge.err  { background: var(--red-soft);   color: var(--red);   }
  .badge.muted{ background: var(--bg); color: var(--muted); border: 1px solid var(--line); }
  /* Gate card — a page that couldn't be reviewed section-by-section */
  .gate-card { display: flex; align-items: flex-start; gap: .75rem; padding: 1rem; background: var(--bg); border-bottom: 1px solid var(--line); }
  .gate-card .gate-msg { margin: .1rem 0 0; font-size: .85rem; color: var(--muted); line-height: 1.5; }
  /* Citation — the evidence grounding a region */
  .citation { padding: .5rem .75rem; background: var(--card); border-bottom: 1px solid var(--line); font-size: .78rem; display: flex; flex-direction: column; gap: .25rem; }
  .citation .cite-k { display: inline-block; min-width: 3.2rem; font-weight: 700; color: var(--muted); text-transform: uppercase; font-size: .64rem; letter-spacing: .05em; }
  .citation .cite-v { color: var(--ink); }
  .region-header .ctype { font-size: .66rem; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; background: var(--bg); padding: .12rem .45rem; border-radius: 4px; border: 1px solid var(--line); }
  /* Region panels */
  .regions { padding: 1rem 1rem .5rem; display: flex; flex-direction: column; gap: 1.25rem; }
  .region { border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
  .region-header { display: flex; align-items: center; gap: .6rem; padding: .5rem .75rem; background: var(--bg); border-bottom: 1px solid var(--line); }
  .region-header .rlabel { font-size: .82rem; font-weight: 600; }
  .region-header .rnote { font-size: .75rem; color: var(--muted); flex: 1; }
  .region-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: var(--line); }
  .region-col { background: var(--card); padding: .4rem .5rem; }
  .region-col figcaption { font-size: .68rem; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: .05em; margin-bottom: .3rem; }
  /* CSS-positioned image crop: clip the full-page PNG to the region window */
  .region-crop {
    position: relative;
    width: 100%;
    overflow: hidden;
    /* height set inline per region */
  }
  .region-crop .crop-inner {
    position: absolute;
    top: 0; left: 0;
    width: 100%;
    transform-origin: top left;
    /* background-image, background-position, background-size set inline */
    background-repeat: no-repeat;
  }
  /* SVG annotation ring overlay */
  .region-crop svg {
    position: absolute;
    top: 0; left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }
  /* Full-page fallback strip */
  .fullpage-strip { border-top: 1px solid var(--line); }
  .fullpage-strip summary { padding: .5rem 1rem; font-size: .78rem; color: var(--muted); cursor: pointer; user-select: none; }
  .fullpage-strip summary:hover { color: var(--ink); }
  .imgs { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1px; background: var(--line); }
  .imgs figure { margin: 0; background: var(--card); padding: .5rem; }
  .imgs figcaption { font-size: .72rem; font-weight: 600; color: var(--muted); margin-bottom: .35rem; text-transform: uppercase; letter-spacing: .04em; }
  .imgs img { width: 100%; height: auto; display: block; border: 1px solid var(--line); border-radius: 4px; }
  .imgs .none { color: var(--muted); font-size: .8rem; padding: 1.5rem; text-align: center; }
</style>
</head>
<body>
<aside><h1>gist<span class="dot">.</span></h1><div id="prs"></div></aside>
<main id="main"><p class="empty">Loading…</p></main>
<script>
// Per-page factual status from the pixel pass. The *judgment* (as-planned vs
// worth-a-look) lives in the regions; these badges just say "did pixels move".
const STATUS = {
  pass:              { label: "Unchanged",     badge: "muted", chip: "muted" },
  "expected-change": { label: "Changed",       badge: "ok",    chip: "ok"   },
  fail:              { label: "Changed",       badge: "ok",    chip: "ok"   },
  new:               { label: "New page",      badge: "ok",    chip: "ok"   },
  removed:           { label: "Page removed",  badge: "muted", chip: "muted" },
  "infra-error":     { label: "Couldn't check", badge: "muted", chip: "muted" },
};
const VERDICT = {
  intended:              { label: "As planned",   cls: "ok" },
  "changed-unmentioned": { label: "Worth a look", cls: "warn" },
};
const CHANGE_TYPE = {
  "text-edit": "Text change",
  added:       "Added",
  removed:     "Removed",
  restyle:     "Restyled",
};
// Gate verdicts from evidence.json — pages that can't be reviewed section by
// section. Rendered as a calm explanatory card, never an alarm.
const GATE = {
  refuse:                { label: "Couldn't compare", cls: "muted" },
  "triage:redesign":     { label: "Full redesign",    cls: "muted" },
  "triage:new-page":     { label: "New page",         cls: "ok"    },
  "triage:removed-page": { label: "Page removed",     cls: "muted" },
};
const GATE_MESSAGE = {
  "viewport-mismatch": "The before and after were captured at different screen sizes, so they can't be lined up. Re-capture both at the same width.",
  "baseline-mismatch": "The ‘before’ looks like a different site entirely — the baseline may point at the wrong place. Check the base URL.",
  "capture-error":     "This page couldn’t be captured, so there’s nothing to compare.",
  "pervasive-change":  "Most of this page changed — it reads as a full redesign. Review it holistically using the before/after below rather than section by section.",
  "page-added":        "This page is brand new — there’s no ‘before’ to compare against.",
  "page-removed":      "This page was removed.",
};
let STATE = { prs: [] };
let selected = null; // { pr, runId }

function mdToHtml(md) {
  const esc = md.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const lines = esc.split(/\\r?\\n/);
  let html = "", inList = false;
  for (const line of lines) {
    const h = /^(#{1,3})\\s+(.*)$/.exec(line);
    const li = /^[-*]\\s+(.*)$/.exec(line);
    if (h) { if (inList){html+="</ul>";inList=false;} html += "<h"+h[1].length+">"+inline(h[2])+"</h"+h[1].length+">"; }
    else if (li) { if(!inList){html+="<ul>";inList=true;} html += "<li>"+inline(li[1])+"</li>"; }
    else if (line.trim()==="") { if(inList){html+="</ul>";inList=false;} }
    else { if(inList){html+="</ul>";inList=false;} html += "<p>"+inline(line)+"</p>"; }
  }
  if (inList) html += "</ul>";
  return html;
}
function inline(s){ return s.replace(/\\*\\*(.+?)\\*\\*/g,"<strong>$1</strong>").replace(/\\*(.+?)\\*/g,"<em>$1</em>"); }
function escapeHtml(s){ return String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }

function renderSidebar() {
  const el = document.getElementById("prs");
  if (STATE.prs.length === 0) { el.innerHTML = '<p class="empty" style="padding:1rem">No PRs yet.<br>Run <code>gist run --pr N</code></p>'; return; }
  el.innerHTML = STATE.prs.map(p => {
    const title = p.meta?.title ?? ("PR #" + p.pr);
    const runs = p.runs.map(r => {
      const active = selected && selected.pr === p.pr && selected.runId === r.evidence.runId ? " active" : "";
      const when = new Date(r.evidence.createdAt).toLocaleString();
      return '<li><button class="run'+active+'" data-pr="'+p.pr+'" data-run="'+r.evidence.runId+'">'+when+'</button></li>';
    }).join("");
    return '<div class="pr"><button data-pr="'+p.pr+'"><span class="num">PR #'+p.pr+'</span><span class="title">'+escapeHtml(title)+'</span></button><ul class="runlist">'+runs+'</ul></div>';
  }).join("");
}

/**
 * Render a CSS-positioned crop of a full-page PNG into a container.
 * The image is scaled to fit the container width; the visible window is
 * the region's y offset + height in the image's pixel space.
 *
 * No image copies — one PNG, N viewport windows via background-position.
 */
function renderCrop(shotUrl, y, height, imgWidthPx, containerWidthPx, verdict) {
  if (!shotUrl) return '<div style="padding:2rem;color:var(--muted);text-align:center;font-size:.8rem">—</div>';
  const scale = containerWidthPx / imgWidthPx;
  const displayHeight = Math.round(height * scale);
  const offsetY = Math.round(y * scale);
  // SVG ring colour
  const stroke = verdict === "suspicious" ? "var(--amber)" : verdict === "intentional" ? "var(--green)" : "var(--muted)";
  return \`<div class="region-crop" style="height:\${displayHeight}px">
    <div class="crop-inner" style="
      background-image: url('\${shotUrl}');
      background-position: 0 -\${offsetY}px;
      background-size: \${containerWidthPx}px auto;
      height: \${displayHeight}px;
    "></div>
    <svg viewBox="0 0 \${containerWidthPx} \${displayHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="\${containerWidthPx-4}" height="\${displayHeight-4}"
        fill="none" stroke="\${stroke}" stroke-width="2.5" rx="4" opacity="0.7"/>
    </svg>
  </div>\`;
}

function renderMain() {
  const main = document.getElementById("main");
  if (!selected) { main.innerHTML = '<p class="empty">Select a run on the left.</p>'; return; }
  const pr = STATE.prs.find(p => p.pr === selected.pr);
  const run = pr?.runs.find(r => r.evidence.runId === selected.runId);
  if (!run) { main.innerHTML = '<p class="empty">Run not found.</p>'; return; }
  const e = run.evidence;
  const t = e.totals;
  const regionsBySlug = {};
  if (run.regions) {
    for (const r of run.regions.regions) {
      (regionsBySlug[r.slug] = regionsBySlug[r.slug] || []).push(r);
    }
  }

  const summary = run.summary
    ? '<div class="summary">'+mdToHtml(run.summary)+'</div>'
    : '<div class="summary missing">No summary yet. In Claude Code, run <code>/gist</code> to generate the walkthrough.</div>';

  const colW = 580; // approximate display width of each region column in px

  const pages = e.pages.map(pg => {
    const st = STATUS[pg.status] ?? { label: pg.status, badge:"muted", chip:"muted" };
    const baseUrl  = pg.screenshots.base ? '/shot/'+e.pullRequest+'/'+e.runId+'/'+pg.screenshots.base : null;
    const headUrl  = pg.screenshots.head ? '/shot/'+e.pullRequest+'/'+e.runId+'/'+pg.screenshots.head : null;
    const diffUrl  = pg.screenshots.diff ? '/shot/'+e.pullRequest+'/'+e.runId+'/'+pg.screenshots.diff : null;

    // Parse natural width from baseDims e.g. "1440x3655"
    const imgW = parseInt((pg.baseDims || pg.headDims || "1440x900").split(/[x×]/)[0]) || 1440;

    // A page the deterministic gate refused or triaged: show a calm card that
    // explains why, in owner language — never fabricated regions.
    const gate = pg.gate || { verdict: "analyze", reason: "ok" };
    let gateHtml = "";
    if (gate.verdict && gate.verdict !== "analyze") {
      const g = GATE[gate.verdict] || { label: gate.verdict, cls: "muted" };
      const msg = GATE_MESSAGE[gate.reason] || "";
      gateHtml = \`<div class="gate-card">
        <span class="badge \${g.cls}">\${g.label}</span>
        <p class="gate-msg">\${escapeHtml(msg)}</p>
      </div>\`;
    }

    const pageRegions = regionsBySlug[pg.slug] || [];
    let regionHtml = "";
    if (pageRegions.length > 0) {
      regionHtml = '<div class="regions">' + pageRegions.map(reg => {
        const v = VERDICT[reg.verdict] || VERDICT["changed-unmentioned"];
        const ctype = CHANGE_TYPE[reg.changeType] || "";
        const base = renderCrop(baseUrl, reg.y, reg.height, imgW, colW, reg.verdict);
        const head = renderCrop(headUrl, reg.y, reg.height, imgW, colW, reg.verdict);
        const cite = reg.citation
          ? \`<div class="citation">
              <div><span class="cite-k">Before</span> <span class="cite-v">\${escapeHtml(reg.citation.base)}</span></div>
              <div><span class="cite-k">After</span> <span class="cite-v">\${escapeHtml(reg.citation.head)}</span></div>
            </div>\`
          : "";
        return \`<div class="region">
          <div class="region-header">
            <span class="badge \${v.cls}">\${v.label}</span>
            <span class="rlabel">\${escapeHtml(reg.label)}</span>
            \${ctype ? '<span class="ctype">'+ctype+'</span>' : ''}
            <span class="rnote">\${escapeHtml(reg.note)}</span>
          </div>
          \${cite}
          <div class="region-cols">
            <figure class="region-col"><figcaption>Before</figcaption>\${base}</figure>
            <figure class="region-col"><figcaption>After</figcaption>\${head}</figure>
          </div>
        </div>\`;
      }).join("") + '</div>';
    }

    // Full-page screenshots always available as a collapsible strip
    const shot = (url) => url
      ? '<img loading="lazy" src="'+url+'" alt=""/>'
      : '<div class="none">—</div>';
    const fullPage = \`<details class="fullpage-strip">
      <summary>Full-page screenshots</summary>
      <div class="imgs">
        <figure><figcaption>Before</figcaption>\${shot(baseUrl)}</figure>
        <figure><figcaption>After</figcaption>\${shot(headUrl)}</figure>
        <figure><figcaption>Diff</figcaption>\${shot(diffUrl)}</figure>
      </div>
    </details>\`;

    return '<div class="page"><header>'
      + '<span class="name">'+escapeHtml(pg.title)+'</span>'
      + '<span class="route">'+escapeHtml(pg.route)+' @ '+escapeHtml(pg.viewport)+pct+'</span>'
      + '<span class="badge '+st.badge+'">'+st.label+'</span>'
      + '</header>'
      + gateHtml
      + (pageRegions.length > 0 ? regionHtml : "")
      + fullPage
      + '</div>';
  }).join("");

  // Prefer the AI's judgment (regions) over the raw pixel buckets for the
  // roll-up: "worth a look" = changed-unmentioned regions + missing claims.
  const allRegions = run.regions?.regions ?? [];
  const worthLook = allRegions.filter(r => r.verdict === "changed-unmentioned").length
    + (run.regions?.missing?.length ?? 0);
  const changedCount = allRegions.filter(r => r.verdict === "intended").length;
  const cantCompare = e.pages.filter(p => p.gate && p.gate.verdict === "refuse").length;

  // Fall back to deterministic buckets only when no AI regions exist yet.
  const chips = run.regions
    ? '<span class="chip">'+t.pages+' pages</span>'
      + '<span class="chip ok">'+changedCount+' changed as planned</span>'
      + (worthLook ? '<span class="chip warn">'+worthLook+' worth a look</span>' : '<span class="chip ok">nothing unexpected</span>')
      + (cantCompare ? '<span class="chip muted">'+cantCompare+" couldn’t compare</span>" : '')
    : '<span class="chip">'+t.pages+' pages</span>'
      + '<span class="chip muted">'+t.changed+' changed</span>'
      + '<span class="chip muted">run /gist for the walkthrough</span>';

  main.innerHTML = '<h2 class="run-title">'+escapeHtml(pr.meta?.title ?? ("PR #"+e.pullRequest))+'</h2>'
    + '<div class="totals">' + chips + '</div>' + summary + pages;
}

document.addEventListener("click", (ev) => {
  const btn = ev.target.closest("button[data-run], .pr > button[data-pr]");
  if (!btn) return;
  if (btn.dataset.run) {
    selected = { pr: Number(btn.dataset.pr), runId: btn.dataset.run };
  } else if (btn.dataset.pr) {
    const pr = STATE.prs.find(p => p.pr === Number(btn.dataset.pr));
    if (pr && pr.runs[0]) selected = { pr: pr.pr, runId: pr.runs[0].evidence.runId };
  }
  renderSidebar(); renderMain();
});

async function load() {
  STATE = await (await fetch("/api/state")).json();
  if (!selected && STATE.prs[0]?.runs[0]) {
    selected = { pr: STATE.prs[0].pr, runId: STATE.prs[0].runs[0].evidence.runId };
  }
  renderSidebar(); renderMain();
}
load();
</script>
</body>
</html>`;
}
