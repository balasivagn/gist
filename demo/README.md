# Gist demo journey

The fixture represents pull request #17 in `demo/gist-site`: the requested homepage signup improvement, a new contact page, and an unexpected pricing layout shift.

Run it without credentials:

```sh
npm run build
```

Open `dist/demo/index.html` at a 375-pixel viewport. The report should lead with the pricing page that needs attention, then show the new and planned changes. Drag or tap the pricing comparison to inspect it.

The generated `status.json` is the machine-readable publication state. This fixture deliberately uses embedded SVG captures so the report remains portable and requires no network access.
