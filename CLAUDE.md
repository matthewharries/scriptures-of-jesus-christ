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
  API (`/study/api/v3/language-pages/type/content?uri=/scriptures/tg/<slug>`) and parses
  `content.body` into one **passage per scripture reference**. Each passage uses the
  verse-anchored church href verbatim (e.g. `…?id=p2#p2`) and the full verse text from the
  bcbooks reference editions, stored as `verses[].html`. The TG catchphrase (from
  `<p class="entry">`) is **located inline within the verse text**: it's split into word
  segments on its ellipses, matched token-by-token against the verse (case-insensitive,
  punctuation-agnostic, in order with gaps), and the matched fragments are wrapped in `<em>`
  with `key-word` emphases in `<strong>`. Unmatched segments (e.g. secondary refs that
  share a catchphrase) just stay plain. Refs in the "See also" footer (`ul.reference`)
  get `fromSeeAlso: true`. Output → **`src/data/topics.json`**; downloads cached in `.cache/`.
- **`scripts/book-map.ts`** — maps church URL volume/book slugs (e.g. `ot`/`ex`) to the
  bcbooks JSON book-name keys (e.g. `Exodus`). Gotchas encoded here: OT uses
  `"Solomon's Song"`, D&C is keyed by **section number directly** (`data[section][verse]`,
  not by a book name), and PoGP names use em-dashes (`Joseph Smith—Matthew`).
- **`src/data/topics.json`** — the committed dataset the site renders. The site makes no
  runtime network calls. Re-run `npm run build-data` to refresh it.
- **Pages**: `src/pages/index.astro` (topic list + client-side filter + resume card) and
  `src/pages/topics/[slug].astro` (`getStaticPaths` from `topics.json`; renders passages,
  with `fromSeeAlso` ones under a "See also" heading). Redirect-only TG entries ("See …")
  carry a `seeAlso` field and no passages.
- **`src/components/Layout.astro`** holds the inline scripts for reading prefs (dark mode,
  font size, serif/sans — one `<head>` script applies them before paint to avoid FOUC, one
  at `</body>` wires the controls) and for the header "Resume" link. State lives in
  `localStorage` under `jcs-*` keys, applied via CSS variables in `src/styles/global.css`.
- **Bookmark**: a single reading bookmark stored at `localStorage['jcs-bookmark']`
  (`{url, title, ref, savedAt}`). Each passage `<section>` (`id="p-N"` + `data-ref`) has a
  bookmark toggle button; clicking makes that passage the bookmark or clears it if it
  already is. The header Resume link and the index resume card read it back. Changes
  broadcast a `jcs-bookmark-changed` event so the header updates without a reload.

## Conventions that matter

- **Base path**: this deploys under a GitHub Pages subpath. Always build internal links
  with the `href()` helper in `src/lib/url.ts` (it joins onto `import.meta.env.BASE_URL`).
  The subpath is set by `base` in `astro.config.mjs` and must match the repo name.
- Tailwind v4 is wired via the `@tailwindcss/vite` plugin (no `tailwind.config.js`);
  dark mode is a manual `.dark` class variant declared in `src/styles/global.css`.
