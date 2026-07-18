/**
 * The single static HTML shell served at `/` by `gist ui`. It fetches
 * `/api/state`, then renders the PR list → runs → summary → per-page
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
    --term-bg: #16161a;
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
  .page { border: 1px solid var(--line); border-radius: 12px; margin-bottom: 1.25rem; overflow: hidden; background: var(--card); }
  .page header { display: flex; align-items: center; gap: .75rem; padding: .7rem 1rem; background: var(--bg); border-bottom: 1px solid var(--line); flex-wrap: wrap; }
  .page header .name { font-weight: 600; font-size: .9rem; }
  .page header .route { color: var(--muted); font-size: .76rem; font-family: var(--mono); }
  .badge { padding: .2rem .65rem; border-radius: 9999px; font-size: .7rem; font-weight: 700; }
  .badge.ok   { background: var(--green-soft); color: var(--green); }
  .badge.warn { background: var(--amber-soft); color: var(--amber); }
  .badge.err  { background: var(--red-soft);   color: var(--red);   }
  .badge.muted{ background: var(--bg); color: var(--muted); border: 1px solid var(--line); }
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
const STATUS = {
  pass:              { label: "Unchanged",         badge: "muted", chip: "muted" },
  "expected-change": { label: "Changed as planned",badge: "ok",    chip: "ok"   },
  fail:              { label: "Unexpected change",  badge: "warn",  chip: "warn" },
  new:               { label: "New page",           badge: "ok",    chip: "ok"   },
  removed:           { label: "Page removed",       badge: "warn",  chip: "warn" },
  "infra-error":     { label: "Couldn't check",     badge: "err",   chip: "warn" },
};
let STATE = { prs: [] };
let selected = null; // { pr, runId }

function mdToHtml(md) {
  // Minimal, safe-enough markdown: escape, then headings/bold/lists/paras.
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
function escapeHtml(s){ return String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }

function renderMain() {
  const main = document.getElementById("main");
  if (!selected) { main.innerHTML = '<p class="empty">Select a run on the left.</p>'; return; }
  const pr = STATE.prs.find(p => p.pr === selected.pr);
  const run = pr?.runs.find(r => r.evidence.runId === selected.runId);
  if (!run) { main.innerHTML = '<p class="empty">Run not found.</p>'; return; }
  const e = run.evidence;
  const t = e.totals;
  const summary = run.summary
    ? '<div class="summary">'+mdToHtml(run.summary)+'</div>'
    : '<div class="summary missing">No summary yet. In Claude Code, run <code>/gist</code> for this run to generate the plain-English walkthrough.</div>';
  const pages = e.pages.map(pg => {
    const st = STATUS[pg.status] ?? { label: pg.status, badge:"muted", chip:"muted" };
    const shot = (kind) => pg.screenshots[kind]
      ? '<img loading="lazy" src="/shot/'+e.pullRequest+'/'+e.runId+'/'+pg.screenshots[kind]+'" alt="'+kind+'"/>'
      : '<div class="none">—</div>';
    const pct = (pg.status==="pass"||pg.status==="fail"||pg.status==="expected-change") ? ' · '+pg.diffPercent+'% diff' : '';
    return '<div class="page"><header>'
      + '<span class="name">'+escapeHtml(pg.title)+'</span>'
      + '<span class="route">'+escapeHtml(pg.route)+' @ '+escapeHtml(pg.viewport)+pct+'</span>'
      + '<span class="badge '+st.badge+'">'+st.label+'</span>'
      + '</header><div class="imgs">'
      + '<figure><figcaption>Before</figcaption>'+shot("base")+'</figure>'
      + '<figure><figcaption>After</figcaption>'+shot("head")+'</figure>'
      + '<figure><figcaption>Diff</figcaption>'+shot("diff")+'</figure>'
      + '</div></div>';
  }).join("");
  main.innerHTML = '<h2 class="run-title">'+escapeHtml(pr.meta?.title ?? ("PR #"+e.pullRequest))+'</h2>'
    + '<div class="totals">'
    + '<span class="chip">'+t.pages+' pages</span>'
    + '<span class="chip ok">'+t.changed+' changed as planned</span>'
    + '<span class="chip '+(t.unexpected?"warn":"muted")+'">'+t.unexpected+' unexpected</span>'
    + '<span class="chip '+(t.broken?"warn":"muted")+'">'+t.broken+' broken</span>'
    + '</div>' + summary + pages;
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
