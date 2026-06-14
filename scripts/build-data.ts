/**
 * Build-time data pipeline for the Jesus Christ Topical Guide reader.
 *
 * 1. Ensures the bcbooks/scriptures-json `reference/` editions are cached locally.
 * 2. Discovers every "Jesus Christ, ..." subtopic from the Topical Guide via the
 *    church's content API.
 * 3. Parses each subtopic's scripture references, resolves the full verse text
 *    from the reference editions, and groups consecutive verses by chapter.
 * 4. Writes the committed static dataset to src/data/topics.json.
 *
 * Run with: npm run build-data
 */
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'node-html-parser';
import { BOOK_NAMES, VOLUME_FILE, isVolume, type Volume } from './book-map.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CACHE = join(ROOT, '.cache');
const DATA_OUT = join(ROOT, 'src', 'data', 'topics.json');

const API = 'https://www.churchofjesuschrist.org/study/api/v3/language-pages/type/content';
const BCBOOKS = 'https://raw.githubusercontent.com/bcbooks/scriptures-json/master/reference';
const SITE = 'https://www.churchofjesuschrist.org';
const UA = 'jesus-christ-scriptures static-site builder (personal study project)';
const POLITE_DELAY_MS = 350;

type ReferenceData = Record<string, Record<string, Record<string, string>>>;

interface Verse {
  num: string;
  text: string | null; // null => text unavailable in the reference editions
}
interface Group {
  reference: string; // display label, e.g. "Genesis 1"
  volume: Volume;
  bookSlug: string;
  chapter: string;
  churchUrl: string; // link back to the full chapter for context
  verses: Verse[];
  chapterOnly: boolean; // reference cited a whole chapter / heading, no verse text
}
interface Topic {
  slug: string;
  title: string;
  refCount: number;
  groups: Group[];
  // Set for "See ..." redirect entries that have no references. `external` marks
  // targets outside this dataset (linked to churchofjesuschrist.org via `url`).
  seeAlso?: { slug: string; title: string; external?: boolean; url?: string };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function fetchText(url: string): Promise<string> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      if (attempt === 3) throw err;
      await sleep(1000 * attempt);
    }
  }
  throw new Error('unreachable');
}

/** Cache the 5 reference editions locally, then load them keyed by volume. */
async function loadReferences(): Promise<Record<Volume, ReferenceData>> {
  await mkdir(CACHE, { recursive: true });
  const out = {} as Record<Volume, ReferenceData>;
  for (const [vol, file] of Object.entries(VOLUME_FILE) as [Volume, string][]) {
    const path = join(CACHE, file);
    if (!(await exists(path))) {
      console.log(`  downloading ${file}`);
      await writeFile(path, await fetchText(`${BCBOOKS}/${file}`));
    }
    out[vol] = JSON.parse(await readFile(path, 'utf8')) as ReferenceData;
  }
  return out;
}

/** Fetch a Topical Guide page via the content API (cached), returning body + title. */
async function fetchTgPage(slug: string): Promise<{ body: string; title: string }> {
  const cachePath = join(CACHE, `tg-${slug || 'index'}.json`);
  let raw: string;
  if (await exists(cachePath)) {
    raw = await readFile(cachePath, 'utf8');
  } else {
    const uri = slug ? `/scriptures/tg/${slug}` : '/scriptures/tg';
    const url = `${API}?lang=eng&uri=${uri}`;
    raw = await fetchText(url);
    await writeFile(cachePath, raw);
    await sleep(POLITE_DELAY_MS);
  }
  const json = JSON.parse(raw) as { content?: { body?: string }; meta?: { title?: string } };
  return { body: json.content?.body ?? '', title: json.meta?.title ?? '' };
}

/**
 * Discover every "Jesus Christ, ..." subtopic. The slugs live in the full
 * Topical Guide index; titles come from each subtopic page's meta.title.
 */
async function discoverSubtopics(): Promise<{ slug: string; title: string }[]> {
  const { body } = await fetchTgPage('');
  const slugs = [
    ...new Set(
      [...body.matchAll(/\/scriptures\/tg\/(jesus-christ-[a-z0-9-]+)/g)].map((m) => m[1]),
    ),
  ];
  const out: { slug: string; title: string }[] = [];
  for (const slug of slugs) {
    const { title } = await fetchTgPage(slug);
    out.push({ slug, title: title || slug });
  }
  return out;
}

/** Expand a verse spec like "10–12", "3, 6", "p2-p7" into ordered verse numbers. */
function expandVerseSpec(spec: string): string[] {
  const cleaned = spec.replace(/[–—]/g, '-').replace(/p/gi, '');
  const out: string[] = [];
  for (const part of cleaned.split(',')) {
    const token = part.trim();
    if (!token) continue;
    const range = token.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      const start = parseInt(range[1], 10);
      const end = parseInt(range[2], 10);
      for (let v = start; v <= end && v - start < 200; v++) out.push(String(v));
    } else if (/^\d+/.test(token)) {
      out.push(token.match(/^\d+[a-z]?/)![0].replace(/[a-z]/g, ''));
    }
  }
  return out;
}

/** Pull the verse spec from the URL id= param (e.g. id=p2-p7). */
function versesFromHref(href: string): string[] {
  const m = href.match(/[?&](?:amp;)?id=([^&#"]+)/);
  return m ? expandVerseSpec(decodeURIComponent(m[1])) : [];
}

/** Pull the verse spec from a reference label (text after the last colon). */
function versesFromLabel(label: string): string[] {
  const idx = label.lastIndexOf(':');
  return idx === -1 ? [] : expandVerseSpec(label.slice(idx + 1));
}

function lookupVerse(
  refs: Record<Volume, ReferenceData>,
  volume: Volume,
  bookSlug: string,
  chapter: string,
  verse: string,
): string | null {
  const data = refs[volume];
  if (volume === 'dc-testament') {
    // Keyed by section number directly (2 levels): data[section][verse]
    const dc = data as unknown as Record<string, Record<string, string>>;
    return dc[chapter]?.[verse] ?? null;
  }
  const bookName = BOOK_NAMES[volume][bookSlug];
  if (!bookName) return null;
  return data[bookName]?.[chapter]?.[verse] ?? null;
}

const unmappedSlugs = new Set<string>();

/** Parse one subtopic page into grouped, text-resolved references. */
function parseTopic(
  slug: string,
  title: string,
  body: string,
  refs: Record<Volume, ReferenceData>,
): Topic {
  const root = parse(body);
  const groups: Group[] = [];
  let refCount = 0;

  for (const a of root.querySelectorAll('a')) {
    const href = (a.getAttribute('href') ?? '').replace(/&amp;/g, '&');
    const m = href.match(/\/study\/scriptures\/(ot|nt|bofm|dc-testament|pgp)\/([^/]+)\/([^/?#]+)/);
    if (!m) continue;
    const volume = m[1];
    if (!isVolume(volume)) continue;
    const bookSlug = m[2];
    const chapter = decodeURIComponent(m[3]);
    const label = a.text.replace(/\s+/g, ' ').trim();

    const bookName =
      volume === 'dc-testament' ? 'Doctrine and Covenants' : BOOK_NAMES[volume][bookSlug];
    if (!bookName) {
      unmappedSlugs.add(`${volume}/${bookSlug}`);
    }

    let verseNums = versesFromLabel(label);
    if (verseNums.length === 0) verseNums = versesFromHref(href);
    const verses: Verse[] = verseNums.map((num) => ({
      num,
      text: lookupVerse(refs, volume, bookSlug, chapter, num),
    }));

    const churchUrl = `${SITE}/study/scriptures/${volume}/${bookSlug}/${chapter}?lang=eng`;
    const reference = `${bookName ?? bookSlug} ${chapter}`;
    refCount++;

    // Merge into the previous group if it's the same chapter (TG lists in order).
    const prev = groups[groups.length - 1];
    if (prev && prev.volume === volume && prev.bookSlug === bookSlug && prev.chapter === chapter) {
      for (const v of verses) {
        if (!prev.verses.some((e) => e.num === v.num)) prev.verses.push(v);
      }
      if (verses.length === 0) prev.chapterOnly = prev.verses.length === 0;
    } else {
      groups.push({
        reference,
        volume,
        bookSlug,
        chapter,
        churchUrl,
        verses,
        chapterOnly: verses.length === 0,
      });
    }
  }

  const topic: Topic = { slug, title, refCount, groups };

  // Redirect-only entries (e.g. "Jesus Christ, Son of God. See Jesus Christ,
  // Divine Sonship.") have no references — capture the cross-reference target.
  if (groups.length === 0) {
    for (const a of root.querySelectorAll('a')) {
      const href = a.getAttribute('href') ?? '';
      const m = href.match(/\/scriptures\/tg\/([a-z0-9-]+)/);
      if (m && m[1] !== slug) {
        topic.seeAlso = { slug: m[1], title: a.text.replace(/\s+/g, ' ').trim() };
        break;
      }
    }
  }

  return topic;
}

async function main() {
  console.log('Loading scripture reference editions...');
  const refs = await loadReferences();

  console.log('Discovering Jesus Christ subtopics...');
  const subtopics = await discoverSubtopics();
  console.log(`  found ${subtopics.length} subtopics`);

  const topics: Topic[] = [];
  for (const { slug, title } of subtopics) {
    const { body } = await fetchTgPage(slug);
    const topic = parseTopic(slug, title, body, refs);
    console.log(`  ${title} — ${topic.refCount} refs in ${topic.groups.length} groups`);
    topics.push(topic);
  }

  // Resolve redirect targets: mark those outside this dataset as external links.
  const known = new Set(topics.map((t) => t.slug));
  for (const t of topics) {
    if (t.seeAlso && !known.has(t.seeAlso.slug)) {
      t.seeAlso.external = true;
      t.seeAlso.url = `${SITE}/study/scriptures/tg/${t.seeAlso.slug}?lang=eng`;
    }
  }

  topics.sort((a, b) => a.title.localeCompare(b.title));

  if (unmappedSlugs.size) {
    console.warn('\n⚠ Unmapped book slugs (shown as links only, no verse text):');
    for (const s of unmappedSlugs) console.warn(`   ${s}`);
  }

  await mkdir(dirname(DATA_OUT), { recursive: true });
  await writeFile(
    DATA_OUT,
    JSON.stringify({ generatedAt: new Date().toISOString(), topics }, null, 2),
  );

  const totalRefs = topics.reduce((n, t) => n + t.refCount, 0);
  const missing = topics.reduce(
    (n, t) => n + t.groups.reduce((m, g) => m + g.verses.filter((v) => v.text === null).length, 0),
    0,
  );
  console.log(`\n✓ Wrote ${topics.length} topics, ${totalRefs} references to src/data/topics.json`);
  if (missing) console.log(`  (${missing} cited verses had no text in the reference editions)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
