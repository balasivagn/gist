# Gist — Pitch & Positioning

## Name

**Gist** — "get the gist of any change." Short, verb-able ("gist this PR"),
readable by a non-technical person. Ties directly to the *understanding* thesis.

## One-liner

> **Approve website changes without reading code.**

## The thesis (use this on stage)

You're a founder. You're building the product. You've handed your website to an AI agent —
it's updating pages, adding sections, tweaking copy whenever you or the marketing team asks.
The agent opens a PR. But you're not a web developer, and you're not going to read a diff.

So how do you actually know what's going live on your public site?

**That's the gap Gist closes.** Not "visual regression testing." Not "QA for engineers."
Human oversight of AI agents shipping your website — for the person who owns the site but
doesn't write the code.

Geoffrey Litt (Notion) calls the accumulated gap "**cognitive debt.**" Gist pays it down:

| Litt's concept | Gist's version |
|---|---|
| AI-generated explainer doc | The plain-English **summary** |
| "Micro-world" you can *feel* your code in | The **walkthrough slideshow** + **diff slider** |
| Shared space where humans + agents build understanding | The **shareable link** the founder reviews |

**Don't pitch "visual regression." Pitch: _Your agent wrote the change. Gist shows you what it actually did._**

Source: <https://www.geoffreylitt.com/2026/07/02/understanding-is-the-new-bottleneck.html>

## Landing page copy

### Hero

> # See exactly what your AI agent shipped to your website.
> You asked the agent to update your pricing page. It opened a pull request.
> **Gist** turns that PR into one link: a plain-English summary of what changed,
> a tappable walkthrough of every changed page with plain-English captions,
> and a before-and-after view of each one.
>
> No diffs. No guessing. Know what's going live — in 30 seconds.
>
> `[ Connect your GitHub repo ]`  ·  *Works with Cloudflare Pages. Netlify & Vercel coming soon.*

### Thesis section

> **Your agent writes the changes. Gist shows you what it actually did.**
> AI agents now ship website changes faster than any founder can review them.
> Gist closes the gap — so you stay in control of your public site without
> becoming a developer.

### How it works (3 steps)

1. **Connect your repo.** Install the Gist GitHub App once.
2. **Open a PR.** Gist builds a preview, captures every page, and writes the review.
3. **Open the link.** Summary, slideshow of changed pages, before/after. Understand — then approve with confidence.

### Numbers block (what the link shows)

> **4 pages changed · 2 need a look · 0 broken**
> Every page that changed, ranked by how much it changed and whether we expected it.

## Demo script (90 seconds)

1. "I'm a founder. I'm not touching my website code — I've handed it to an AI agent."
2. "I asked the agent to update my pricing page. It opened this PR." — show the PR.
3. Wait beat. "Gist posts one link." — bot comment appears with the Gist link within seconds.
   (Pre-run the pipeline on the staged PR beforehand so artifacts are hot — the live run
   only needs to produce the comment. Rehearsed magic beats real suspense.)
4. Open the link. Read the AI summary aloud — it's plain English.
5. Swipe through the slideshow. "I don't read the diff. I swipe through what changed —
   each page, with a one-line explanation."
6. Drag the before/after slider on the one flagged page.
7. "4 pages changed, 1 worth a second look. I know exactly what my agent shipped — without
   reading a single line of code."
8. Close: "The agent writes the changes. Gist shows you what it actually did."

## Naming alternatives (if Gist is taken)

- **Vantage** — "a clear vantage on every change" (premium, approver-oriented)
- **Greenlight** — literally the action the owner takes (legible, maybe generic)
- **Legible**, **Grokit**, **Beforehand**, **Overlook**
