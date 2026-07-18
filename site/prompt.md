# Set up Gist in this project

These are the official setup instructions for Gist, a local, open-source tool
that captures before-and-after screenshots for a website change and turns them
into a plain-English review.

Complete the setup yourself by running the commands and editing the project
files directly. Do not ask the user to copy commands that you can run. Preserve
any existing Gist configuration you find.

## 1. Check the project

- Work from the root of the website repository the user wants to review.
- Confirm Node.js 22 or newer is available.
- Inspect the project to identify its public routes and, when it is already
  documented, its production URL.

If the production URL cannot be determined from the repository, ask the user
for that one value before configuring Gist.

## 2. Install and initialize Gist

Run:

```sh
npm install -g @gist/review
gist init
```

`gist init` installs the Playwright Chromium browser on first use, creates
`.gist/config.json`, adds `.gist/` to `.gitignore`, and installs the bundled
Gist skill into `.claude/skills/gist/`.

If you are not Claude Code, copy the installed `gist` skill directory into the
project-local skills directory used by your current agent. Keep the skill name
`gist` and preserve its `SKILL.md` file.

## 3. Configure the site

Open `.gist/config.json` and:

- Set `productionUrl` to the live site URL.
- Replace the starter `routes` list with the important public pages you found
  in the project. Keep the list focused; do not add private, destructive, or
  sign-out routes.
- Keep the default desktop and mobile viewports unless the project documents
  different target sizes.
- Preserve any existing user configuration instead of replacing it wholesale.

## 4. Verify the setup

Run:

```sh
gist --help
```

Confirm that:

- `.gist/config.json` exists and contains the correct production URL.
- `.gist/` is ignored by Git.
- The Gist skill is available to the current coding agent.

Do not run `gist run` until there is a pull request or the user provides the
base and preview URLs to compare.

When setup is complete, tell the user what production URL and routes were
configured, where the Gist skill was installed, and that their next command is:

```sh
gist run --pr <number>
```

After a run, use the Gist skill to write the plain-English walkthrough, then
open the local review with `gist ui`.

These instructions are published at
`https://gist.masalageek.com/prompt.md` so their contents can be verified at
any time.
