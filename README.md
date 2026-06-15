# Scriptures of Jesus Christ

A clean, mobile-friendly reader for every scripture the LDS [Topical Guide](https://www.churchofjesuschrist.org/study/scriptures/tg?lang=eng)
gathers under **Jesus Christ** — the main entry and all 57 "Jesus Christ, …" subtopics.
Each topic gets its own page with the full text of every referenced verse, grouped by
chapter, with a link back to churchofjesuschrist.org for full context.

Built with [Astro](https://astro.build) + [Tailwind CSS](https://tailwindcss.com),
output as a fully static site for **GitHub Pages**.

## How it works

Scripture data is assembled once at **build time** into a committed JSON file
(`src/data/topics.json`); the site itself makes no network calls at runtime. The pipeline
combines two sources:

- **Topic → reference list** — the church study content API
  (`/study/api/v3/language-pages/type/content`) for each Topical Guide topic.
- **Reference → full verse text** — the
  [bcbooks/scriptures-json](https://github.com/bcbooks/scriptures-json) `reference/`
  editions. KJV (Old/New Testament) text is public domain.

See `scripts/build-data.ts` and `scripts/book-map.ts`.

## Commands

```bash
npm install        # install dependencies
npm run dev        # local dev server
npm run build      # static build -> dist/
npm run preview    # serve the production build locally
npm run build-data # refresh src/data/topics.json from the church TG + bcbooks JSON
```

`npm run build-data` caches all downloads in `.cache/`; delete that folder to force a
fresh fetch. The site `build`/`dev` commands rely on the committed `topics.json`, so you
only need to re-run `build-data` when you want to refresh the scripture data.

## Deploying to GitHub Pages

This is deployed as a **standalone project repo** served under the existing
`matthewharries.dev` apex domain at `https://matthewharries.dev/scriptures-of-jesus-christ/`.
Because the user site (`matthewharries.github.io`) has that custom domain, GitHub
automatically serves every other project repo at `matthewharries.dev/<repo-name>/` — the
main site is never touched and never references this one.

Steps:

1. **Create the GitHub repo named `scriptures-of-jesus-christ`** (the repo name *is* the URL
   path, and must match `base` in `astro.config.mjs`). Push this project to it.
2. In that repo: **Settings → Pages → Build and deployment → Source = GitHub Actions**.
   `.github/workflows/deploy.yml` builds and publishes on every push to `main`.

Do **not** add a `CNAME` file to this repo — the apex domain belongs to the user site, and
project repos inherit it automatically. The pages also send `noindex, nofollow` so the site
stays unlisted (out of search engines) even though it is technically public.

## Reading features

Dark / light mode, adjustable font size, and a serif / sans-serif toggle (all persisted
in `localStorage`), plus a topic filter on the home page. The Topical Guide catchphrase is
italicized inline within each verse (its emphasized key word in bold), and every reference
heading links straight to that passage on churchofjesuschrist.org. A single **bookmark**
remembers your spot — tap the bookmark icon on any passage, then **Resume** (in the header
or on the home page) to jump back.
