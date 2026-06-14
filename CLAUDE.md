# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A static Astro + Tailwind site that presents every LDS Topical Guide scripture under
"Jesus Christ" (the 57 "Jesus Christ, …" subtopics) as readable, full-text pages.
Deployed to GitHub Pages under a subpath.

## Commands

```bash
npm run dev        # local dev server
npm run build      # static build -> dist/
npm run preview    # serve the production build
npm run build-data # regenerate src/data/topics.json (the only thing that hits the network)
```

There is no test suite. Verify changes via `npm run build` + `npm run preview`.

## Architecture

The key idea is a **build-time data pipeline** feeding a **static site**; the two are
decoupled by a committed JSON file.

- **`scripts/build-data.ts`** — fetches each Topical Guide topic from the church content
  API (`/study/api/v3/language-pages/type/content?uri=/scriptures/tg/<slug>`), parses the
  `content.body` HTML for scripture reference links, resolves each reference to full verse
  text from the bcbooks reference editions, groups consecutive verses by chapter, and
  writes **`src/data/topics.json`**. Responses + downloads are cached in `.cache/`.
- **`scripts/book-map.ts`** — maps church URL volume/book slugs (e.g. `ot`/`ex`) to the
  bcbooks JSON book-name keys (e.g. `Exodus`). Gotchas encoded here: OT uses
  `"Solomon's Song"`, D&C is keyed by **section number directly** (`data[section][verse]`,
  not by a book name), and PoGP names use em-dashes (`Joseph Smith—Matthew`).
- **`src/data/topics.json`** — the committed dataset the site renders. The site makes no
  runtime network calls. Re-run `npm run build-data` to refresh it.
- **Pages**: `src/pages/index.astro` (topic list + client-side filter) and
  `src/pages/topics/[slug].astro` (`getStaticPaths` from `topics.json`). Redirect-only TG
  entries ("See …") carry a `seeAlso` field instead of `groups`.
- **`src/components/Layout.astro`** holds the reading-preference logic (dark mode, font
  size, serif/sans) as inline scripts: one in `<head>` applies saved prefs before paint
  (avoids FOUC), one at end of `<body>` wires the controls. State lives in `localStorage`
  under `jcs-*` keys and is applied via CSS variables in `src/styles/global.css`.

## Conventions that matter

- **Base path**: this deploys under a GitHub Pages subpath. Always build internal links
  with the `href()` helper in `src/lib/url.ts` (it joins onto `import.meta.env.BASE_URL`).
  The subpath is set by `base` in `astro.config.mjs` and must match the repo name.
- Tailwind v4 is wired via the `@tailwindcss/vite` plugin (no `tailwind.config.js`);
  dark mode is a manual `.dark` class variant declared in `src/styles/global.css`.
