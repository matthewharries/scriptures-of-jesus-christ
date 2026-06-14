// Join an internal path onto the configured base path (for GitHub Pages subpaths).
const BASE = import.meta.env.BASE_URL.replace(/\/$/, ''); // normalize, no trailing slash

export function href(path = ''): string {
  const p = path.replace(/^\//, '');
  return p ? `${BASE}/${p}` : `${BASE}/`;
}

/** A short display label for a topic title (drops the leading "Jesus Christ, "). */
export function shortTitle(title: string): string {
  return title.replace(/^Jesus Christ,\s*/, '');
}
