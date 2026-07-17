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
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, -apple-system, sans-serif; background: #0b1120; color: #e2e8f0; display: grid; grid-template-columns: 300px 1fr; height: 100vh; }
  aside { border-right: 1px solid #1e293b; overflow-y: auto; background: #0f172a; }
  aside h1 { font-size: .95rem; padding: 1rem 1.25rem; margin: 0; border-bottom: 1px solid #1e293b; letter-spacing: .02em; }
  .pr { border-bottom: 1px solid #1e293b; }
  .pr > button { width: 100%; text-align: left; background: none; border: 0; color: inherit; padding: .8rem 1.25rem; cursor: pointer; font: inherit; }
  .pr > button:hover { background: #16233b; }
  .pr .num { color: #64748b; font-size: .75rem; }
  .pr .title { display: block; margin-top: .2rem; font-size: .85rem; }
  .runlist { list-style: none; margin: 0; padding: 0 0 .4rem; }
  .runlist li button { width: 100%; text-align: left; background: none; border: 0; color: #94a3b8; padding: .35rem 1.25rem .35rem 2rem; cursor: pointer; font: inherit; font-size: .76rem; }
  .runlist li button:hover, .runlist li button.active { background: #1e293b; color: #e2e8f0; }
  main { overflow-y: auto; padding: 1.5rem 2rem 4rem; }
  .empty { color: #64748b; margin-top: 3rem; text-align: center; }
  .totals { display: flex; gap: .6rem; flex-wrap: wrap; margin: .75rem 0 1.25rem; }
  .chip { padding: .3rem .7rem; border-radius: 9999px; font-size: .76rem; font-weight: 600; background: #1e293b; }
  .chip.warn { background: #7f1d1d; color: #fecaca; }
  .chip.ok { background: #14532d; color: #bbf7d0; }
  .chip.muted { background: #1e293b; color: #94a3b8; }
  .summary { background: #0f172a; border: 1px solid #1e293b; border-radius: 12px; padding: 1.25rem 1.5rem; margin-bottom: 1.75rem; line-height: 1.55; }
  .summary.missing { color: #64748b; font-style: italic; }
  .summary h1, .summary h2, .summary h3 { margin: .3rem 0 .5rem; }
  .page { border: 1px solid #1e293b; border-radius: 12px; margin-bottom: 1.25rem; overflow: hidden; }
  .page header { display: flex; align-items: center; gap: .8rem; padding: .7rem 1rem; background: #0f172a; flex-wrap: wrap; }
  .page header .name { font-weight: 600; }
  .page header .route { color: #64748b; font-size: .78rem; }
  .badge { padding: .2rem .6rem; border-radius: 9999px; font-size: .7rem; font-weight: 700; color: #fff; }
  .imgs { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1px; background: #1e293b; }
  .imgs figure { margin: 0; background: #0b1120; padding: .4rem; }
  .imgs figcaption { font-size: .68rem; text-transform: uppercase; letter-spacing: .05em; color: #64748b; margin-bottom: .35rem; }
  .imgs img { width: 100%; height: auto; display: block; border: 1px solid #1e293b; }
  .imgs .none { color: #475569; font-size: .78rem; padding: 1rem; text-align: center; }
</style>
</head>
<body>
<aside><h1>Gist</h1><div id="prs"></div></aside>
<main id="main"><p class="empty">Loading…</p></main>
<script>
const STATUS = {
  pass:              { label: "Unchanged",        color: "#475569", chip: "muted" },
  "expected-change": { label: "Changed as planned",color: "#a855f7", chip: "ok" },
  fail:              { label: "Unexpected change", color: "#dc2626", chip: "warn" },
  new:               { label: "New page",         color: "#0ea5e9", chip: "ok" },
  removed:           { label: "Page removed",     color: "#f59e0b", chip: "warn" },
  "infra-error":     { label: "Couldn't check",   color: "#f97316", chip: "warn" },
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
    const st = STATUS[pg.status] ?? { label: pg.status, color:"#475569", chip:"muted" };
    const shot = (kind) => pg.screenshots[kind]
      ? '<img loading="lazy" src="/shot/'+e.pullRequest+'/'+e.runId+'/'+pg.screenshots[kind]+'" alt="'+kind+'"/>'
      : '<div class="none">—</div>';
    const pct = (pg.status==="pass"||pg.status==="fail"||pg.status==="expected-change") ? ' · '+pg.diffPercent+'% diff' : '';
    return '<div class="page"><header>'
      + '<span class="name">'+escapeHtml(pg.title)+'</span>'
      + '<span class="route">'+escapeHtml(pg.route)+' @ '+escapeHtml(pg.viewport)+pct+'</span>'
      + '<span class="badge" style="background:'+st.color+'">'+st.label+'</span>'
      + '</header><div class="imgs">'
      + '<figure><figcaption>Before</figcaption>'+shot("base")+'</figure>'
      + '<figure><figcaption>After</figcaption>'+shot("head")+'</figure>'
      + '<figure><figcaption>Diff</figcaption>'+shot("diff")+'</figure>'
      + '</div></div>';
  }).join("");
  main.innerHTML = '<h2>'+escapeHtml(pr.meta?.title ?? ("PR #"+e.pullRequest))+'</h2>'
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
