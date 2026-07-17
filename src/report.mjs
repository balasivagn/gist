const STATUS_PRESENTATION = Object.freeze({
  fail: { label: "Changed — not part of this update", rank: 0, tone: "warning" },
  removed: { label: "Page removed", rank: 1, tone: "warning" },
  "infra-error": { label: "Couldn't check", rank: 2, tone: "muted" },
  new: { label: "New page", rank: 3, tone: "positive" },
  "expected-change": { label: "Changed as planned", rank: 4, tone: "positive" },
  pass: { label: "Unchanged", rank: 5, tone: "muted" }
});

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function requireString(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${field} must be a non-empty string`);
  }
}

export function validateEvidence(evidence) {
  if (!evidence || typeof evidence !== "object") {
    throw new TypeError("evidence must be an object");
  }
  if (evidence.version !== 1) {
    throw new TypeError("evidence.version must be 1");
  }
  requireString(evidence.repository, "evidence.repository");
  if (!evidence.pullRequest || !Number.isInteger(evidence.pullRequest.number)) {
    throw new TypeError("evidence.pullRequest.number must be an integer");
  }
  requireString(evidence.pullRequest.title, "evidence.pullRequest.title");
  requireString(evidence.pullRequest.headSha, "evidence.pullRequest.headSha");
  if (!Array.isArray(evidence.pages) || evidence.pages.length === 0) {
    throw new TypeError("evidence.pages must contain at least one page");
  }
  for (const [index, page] of evidence.pages.entries()) {
    requireString(page.route, `evidence.pages[${index}].route`);
    requireString(page.title, `evidence.pages[${index}].title`);
    if (!STATUS_PRESENTATION[page.status]) {
      throw new TypeError(`evidence.pages[${index}].status is unsupported`);
    }
    if (typeof page.diffRatio !== "number" || page.diffRatio < 0 || page.diffRatio > 1) {
      throw new TypeError(`evidence.pages[${index}].diffRatio must be between 0 and 1`);
    }
  }
  return evidence;
}

function orderedChangedPages(pages) {
  return pages
    .filter((page) => page.status !== "pass")
    .toSorted((left, right) => {
      const rankDifference = STATUS_PRESENTATION[left.status].rank - STATUS_PRESENTATION[right.status].rank;
      return rankDifference || right.diffRatio - left.diffRatio || left.route.localeCompare(right.route);
    });
}

function summarize(pages) {
  return {
    changed: pages.filter((page) => !["pass", "infra-error"].includes(page.status)).length,
    needsLook: pages.filter((page) => ["fail", "removed"].includes(page.status)).length,
    broken: pages.filter((page) => page.status === "infra-error").length
  };
}

function deterministicCopy(counts, changedPages, globalChange) {
  if (globalChange) {
    return {
      headline: "This update touches the whole site",
      summary: `${counts.changed} pages changed as part of a common site-wide update. Start with the representative pages below.`
    };
  }
  const firstConcern = changedPages.find((page) => ["fail", "removed"].includes(page.status));
  const headline = counts.needsLook > 0
    ? `${counts.needsLook} ${counts.needsLook === 1 ? "page needs" : "pages need"} a look`
    : `${counts.changed} ${counts.changed === 1 ? "page changed" : "pages changed"} as planned`;
  const summary = firstConcern
    ? `${counts.changed} pages changed. Check ${firstConcern.title} first; its visual change was not expected from this update.`
    : `${counts.changed} pages changed, and the captured evidence matches the planned update.`;
  return { headline, summary };
}

function comparison(page, index) {
  if (!page.productionImage || !page.previewImage) return "";
  const id = `diff-${index}`;
  return `<div class="diff" data-diff aria-label="Compare before and after for ${escapeHtml(page.title)}">
    <img class="diff-before" src="${escapeHtml(page.productionImage)}" alt="Before: ${escapeHtml(page.title)}">
    <div class="diff-after" data-diff-after><img src="${escapeHtml(page.previewImage)}" alt="After: ${escapeHtml(page.title)}"></div>
    <input id="${id}" type="range" min="0" max="100" value="50" aria-label="Reveal after image for ${escapeHtml(page.title)}" aria-valuetext="50% after" data-diff-range>
    <span class="diff-label diff-label-before">Before</span><span class="diff-label diff-label-after">After</span>
  </div><button class="diff-toggle" type="button" data-diff-toggle aria-controls="${id}">Show before</button>`;
}

function pageCard(page, index) {
  const presentation = STATUS_PRESENTATION[page.status];
  const caption = page.caption || `${page.title} is ${presentation.label.toLowerCase()}.`;
  return `<article class="page-card" data-route="${escapeHtml(page.route)}">
    <div class="page-heading">
      <div><p class="eyebrow">${escapeHtml(page.route)}</p><h3>${escapeHtml(page.title)}</h3></div>
      <span class="status status-${presentation.tone}">${escapeHtml(presentation.label)}</span>
    </div>
    <p>${escapeHtml(caption)}</p>${comparison(page, index)}
  </article>`;
}

function slide(page, index) {
  const caption = page.caption || `${page.title} is ${STATUS_PRESENTATION[page.status].label.toLowerCase()}.`;
  const image = page.previewImage
    ? `<img src="${escapeHtml(page.previewImage)}" alt="Preview of ${escapeHtml(page.title)}">`
    : `<div class="image-placeholder" role="img" aria-label="Preview unavailable for ${escapeHtml(page.title)}">Preview unavailable</div>`;
  return `<figure class="slide" data-slide="${index}"${index === 0 ? "" : " hidden"}>
    ${image}
    <figcaption><strong>${escapeHtml(page.title)}</strong><span>${escapeHtml(caption)}</span></figcaption>
  </figure>`;
}

const STYLES = `
:root{color-scheme:light;--ink:#17201b;--muted:#65716a;--canvas:#f4f3ee;--card:#fff;--line:#d9ddd8;--green:#19613b;--green-bg:#e4f4e9;--amber:#895913;--amber-bg:#fff0d5;--max:45rem;font-family:Inter,ui-sans-serif,system-ui,sans-serif}
*{box-sizing:border-box}body{margin:0;background:var(--canvas);color:var(--ink);line-height:1.55}main{width:min(100% - 2rem,var(--max));margin:auto;padding:2rem 0 5rem}h1{font-size:clamp(2rem,9vw,4.25rem);letter-spacing:-.055em;line-height:.98;margin:.35rem 0 1rem}h2{font-size:1.45rem;margin:0 0 1rem}h3,p{margin:0}.lede{font-size:1.1rem;max-width:62ch;color:#39453e}.brand{font-weight:800;letter-spacing:-.03em}.meta,.eyebrow{font-size:.78rem;color:var(--muted);text-transform:uppercase;letter-spacing:.08em}.meta{margin-top:.35rem}.panel{background:var(--card);border:1px solid var(--line);border-radius:1.2rem;padding:1rem;margin-top:1rem;box-shadow:0 8px 28px #17201b0a}.chips{display:flex;gap:.5rem;flex-wrap:wrap;margin:1.5rem 0}.chip{background:var(--card);border:1px solid var(--line);border-radius:999px;padding:.6rem .8rem;font-weight:700}.chip span{display:block;font-size:.72rem;font-weight:500;color:var(--muted)}.slide img,.image-placeholder{display:block;width:100%;aspect-ratio:16/10;object-fit:cover;background:#e8ebe7;border-radius:.75rem}.image-placeholder{display:grid;place-items:center;color:var(--muted)}figure{margin:0}figcaption{display:grid;gap:.2rem;padding-top:.8rem}.slide-controls{display:flex;justify-content:space-between;align-items:center;margin-top:.8rem}.slide-controls button{min-width:44px;min-height:44px;border:1px solid var(--line);border-radius:999px;background:var(--card);font:inherit;font-weight:700}.page-list{display:grid;gap:.75rem}.page-card{background:var(--card);border:1px solid var(--line);border-radius:1rem;padding:1rem}.page-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:.75rem;margin-bottom:.75rem}.status{font-size:.75rem;font-weight:750;padding:.35rem .55rem;border-radius:999px;text-align:right}.status-warning{color:var(--amber);background:var(--amber-bg)}.status-positive{color:var(--green);background:var(--green-bg)}.status-muted{color:var(--muted);background:#edf0ed}.diff{position:relative;overflow:hidden;aspect-ratio:16/10;margin-top:1rem;border-radius:.75rem;background:#e8ebe7;touch-action:pan-y}.diff img{display:block;width:100%;height:100%;object-fit:cover}.diff-after{position:absolute;inset:0;clip-path:inset(0 0 0 50%)}.diff input{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:.01;cursor:ew-resize;min-height:44px}.diff:has(input:focus-visible){outline:3px solid #2266cc;outline-offset:3px}.diff-label{position:absolute;top:.5rem;padding:.25rem .45rem;border-radius:.35rem;background:#17201bd9;color:#fff;font-size:.72rem;pointer-events:none}.diff-label-before{left:.5rem}.diff-label-after{right:.5rem}.diff-toggle{min-height:44px;margin-top:.5rem;border:1px solid var(--line);border-radius:999px;background:var(--card);font:inherit;font-weight:700;padding:.4rem .8rem}@media(min-width:640px){main{padding-top:4rem}.panel,.page-card{padding:1.35rem}}
`;

const SLIDES_SCRIPT = `
const slides=[...document.querySelectorAll('[data-slide]')];let current=0;
const show=(next)=>{current=(next+slides.length)%slides.length;slides.forEach((slide,index)=>slide.hidden=index!==current);document.querySelector('[data-slide-count]').textContent=(current+1)+' / '+slides.length;};
document.querySelector('[data-prev]')?.addEventListener('click',()=>show(current-1));
document.querySelector('[data-next]')?.addEventListener('click',()=>show(current+1));
let startX=null;document.querySelector('[data-walkthrough]')?.addEventListener('pointerdown',(event)=>{startX=event.clientX});
document.querySelector('[data-walkthrough]')?.addEventListener('pointerup',(event)=>{if(startX!==null&&Math.abs(event.clientX-startX)>40)show(current+(event.clientX<startX?1:-1));startX=null});
document.querySelectorAll('[data-diff]').forEach((diff)=>{const range=diff.querySelector('[data-diff-range]');const after=diff.querySelector('[data-diff-after]');const toggle=diff.parentElement.querySelector('[data-diff-toggle]');const set=(value)=>{const percent=Number(value);range.value=String(percent);range.setAttribute('aria-valuetext',percent+'% after');after.style.clipPath='inset(0 '+(100-percent)+'% 0 0)';toggle.textContent=percent<50?'Show after':'Show before';};range.addEventListener('input',()=>set(range.value));toggle.addEventListener('click',()=>set(Number(range.value)<50?100:0));});
`;

export function generateReport(rawEvidence, options = {}) {
  const evidence = validateEvidence(rawEvidence);
  const changedPages = orderedChangedPages(evidence.pages);
  const counts = summarize(evidence.pages);
  const globalChange = counts.changed / evidence.pages.length > 0.6;
  const copy = options.copy || deterministicCopy(counts, changedPages, globalChange);
  const slides = options.slides || changedPages;
  const primaryCards = globalChange ? changedPages.slice(0, 3) : changedPages;
  const overflowCards = globalChange ? changedPages.slice(3) : [];
  const cards = `${primaryCards.map(pageCard).join("")}${overflowCards.length > 0 ? `<details class="more-pages"><summary>Show ${overflowCards.length} more changed ${overflowCards.length === 1 ? "page" : "pages"}</summary>${overflowCards.map((page, index) => pageCard(page, index + 3)).join("")}</details>` : ""}`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(copy.headline)} · Gist</title><style>${STYLES}</style></head><body>
  <main><header><div class="brand">Gist</div><p class="meta">${escapeHtml(evidence.repository)} · Pull request #${evidence.pullRequest.number}</p></header>
    <section aria-labelledby="report-title"><p class="eyebrow">Website change review</p><h1 id="report-title">${escapeHtml(copy.headline)}</h1><p class="lede">${escapeHtml(copy.summary)}</p></section>
    <div class="chips" aria-label="Change totals"><div class="chip">${counts.changed}<span>changed</span></div><div class="chip">${counts.needsLook}<span>need a look</span></div><div class="chip">${counts.broken}<span>couldn't check</span></div></div>
    <section class="panel" data-walkthrough aria-labelledby="walkthrough-title"><h2 id="walkthrough-title">Walk through the change</h2>${slides.map(slide).join("")}<div class="slide-controls"><button type="button" data-prev aria-label="Previous changed page">←</button><span data-slide-count>1 / ${slides.length}</span><button type="button" data-next aria-label="Next changed page">→</button></div></section>
    <section aria-labelledby="pages-title" style="margin-top:2rem"><h2 id="pages-title">Pages to review</h2><div class="page-list">${cards}</div></section>
  </main><script>${SLIDES_SCRIPT}</script></body></html>`;
  return {
    html,
    status: {
      version: 1,
      state: options.state || "complete",
      repository: evidence.repository,
      pullRequest: evidence.pullRequest.number,
      headSha: evidence.pullRequest.headSha,
      counts
    }
  };
}
