// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// Deployed as a standalone GitHub Pages project repo. Because the user site
// (matthewharries.github.io) has the custom apex domain matthewharries.dev,
// GitHub automatically serves this project at matthewharries.dev/<repo-name>/.
// `base` must equal the GitHub repo name — so this repo must be named
// `scriptures-of-jesus-christ` to be served at /scriptures-of-jesus-christ/.
export default defineConfig({
  site: 'https://matthewharries.dev',
  base: '/scriptures-of-jesus-christ',
  trailingSlash: 'ignore',
  vite: {
    // Cast avoids a type clash between @tailwindcss/vite's Vite and Astro's bundled Vite.
    plugins: [/** @type {any} */ (tailwindcss())],
  },
});
