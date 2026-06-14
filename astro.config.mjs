// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// IMPORTANT: this site deploys to GitHub Pages under a subpath.
// - `site`: your GitHub Pages origin (e.g. https://<username>.github.io)
// - `base`: the repo subpath it is served from. If this repo is published as
//   https://<username>.github.io/jesus-christ-scriptures/ leave it as below.
//   If you serve it from a different path, change `base` to match.
export default defineConfig({
  site: 'https://example.github.io',
  base: '/jesus-christ-scriptures',
  trailingSlash: 'ignore',
  vite: {
    // Cast avoids a type clash between @tailwindcss/vite's Vite and Astro's bundled Vite.
    plugins: [/** @type {any} */ (tailwindcss())],
  },
});
