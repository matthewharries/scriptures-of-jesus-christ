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
import { parse, NodeType, type HTMLElement, type Node } from 'node-html-parser';
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
  // Verse text as safe HTML: the Topical Guide catchphrase fragments are wrapped
  // in <em> and their emphasized key words in <strong>. null => text unavailable.
  html: string | null;
}
interface VerseText {
  num: string;
  text: string | null; // null => text unavailable in the reference editions
}
// One Topical Guide reference: the cited verse(s) — with the catchphrase
// italicized inline — and a link straight to those verses on the church site.
interface Passage {
  reference: string; // display label, e.g. "Ex. 15:2"
  volume: Volume;
  bookSlug: string;
  chapter: string;
  churchUrl: string; // verse-anchored link
  verses: Verse[];
  chapterOnly: boolean; // reference cited a whole chapter / heading, no verse text
  fromSeeAlso: boolean; // came from the "See also" footer (no catchphrase)
}
interface Topic {
  slug: string;
  title: string;
  refCount: number;
  passages: Passage[];
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

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// A catchphrase word, flagged if it was emphasized (<span class="key-word">).
interface PhraseWord {
  w: string; // lowercased, for matching
  key: boolean;
}
const WORD_RE = /[A-Za-z0-9'’]+/g;

/**
 * Split an entry's catchphrase into segments of word-tokens. The catchphrase
 * precedes the first scripture reference and uses an ellipsis (… or ...) to mark
 * where words were omitted, so each ellipsis starts a new segment. Emphasized
 * words (<span class="key-word">) are flagged.
 */
function extractSegments(entry: HTMLElement): PhraseWord[][] {
  const segments: PhraseWord[][] = [];
  let current: PhraseWord[] = [];
  const add = (text: string, key: boolean) => {
    const parts = text.split(/…|\.\.\./);
    parts.forEach((part, i) => {
      if (i > 0) {
        segments.push(current);
        current = [];
      }
      for (const m of part.matchAll(WORD_RE)) current.push({ w: m[0].toLowerCase(), key });
    });
  };
  for (const node of entry.childNodes as Node[]) {
    const el = node as HTMLElement;
    if (el.nodeType === NodeType.ELEMENT_NODE && el.classList?.contains('scripture-ref')) break;
    if (node.nodeType === NodeType.TEXT_NODE) add(node.text, false);
    else if (el.classList?.contains('key-word')) add(el.text, true);
    else add(el.text ?? '', false);
  }
  segments.push(current);
  return segments.filter((s) => s.length > 0);
}

interface BoldRange {
  start: number;
  end: number;
}
interface ItalicRange {
  start: number;
  end: number;
  bolds: BoldRange[];
}

/** Render verse text with the given italic (catchphrase) / bold (key word) ranges. */
function renderMarked(text: string, italics: ItalicRange[]): string {
  if (italics.length === 0) return escapeHtml(text);
  italics.sort((a, b) => a.start - b.start);
  let out = '';
  let cursor = 0;
  for (const it of italics) {
    out += escapeHtml(text.slice(cursor, it.start)) + '<em>';
    let ic = it.start;
    for (const b of it.bolds.sort((a, b) => a.start - b.start)) {
      out += escapeHtml(text.slice(ic, b.start)) + '<strong>' + escapeHtml(text.slice(b.start, b.end)) + '</strong>';
      ic = b.end;
    }
    out += escapeHtml(text.slice(ic, it.end)) + '</em>';
    cursor = it.end;
  }
  return out + escapeHtml(text.slice(cursor));
}

/**
 * Locate each catchphrase segment within the passage's verses (in order, allowing
 * gaps for the ellipses) and return verse HTML with the matched fragments
 * italicized and emphasized key words bolded. Unmatched segments are skipped.
 */
function markVerses(verses: VerseText[], segments: PhraseWord[][]): Verse[] {
  const verseTokens = verses.map((v) =>
    v.text
      ? [...v.text.matchAll(WORD_RE)].map((m) => ({
          lc: m[0].toLowerCase(),
          start: m.index!,
          end: m.index! + m[0].length,
        }))
      : [],
  );
  const italics: ItalicRange[][] = verses.map(() => []);

  let pVi = 0;
  let pTi = 0; // search pointer: start at verse pVi, token pTi
  for (const seg of segments) {
    const len = seg.length;
    let placed = false;
    for (let vi = pVi; vi < verses.length && !placed; vi++) {
      const toks = verseTokens[vi];
      for (let ti = vi === pVi ? pTi : 0; ti + len <= toks.length; ti++) {
        let ok = true;
        for (let k = 0; k < len; k++) {
          if (toks[ti + k].lc !== seg[k].w) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;
        const range: ItalicRange = { start: toks[ti].start, end: toks[ti + len - 1].end, bolds: [] };
        for (let k = 0; k < len; k++) {
          if (seg[k].key) range.bolds.push({ start: toks[ti + k].start, end: toks[ti + k].end });
        }
        italics[vi].push(range);
        pVi = vi;
        pTi = ti + len;
        placed = true;
        break;
      }
    }
  }

  return verses.map((v, vi) => ({
    num: v.num,
    html: v.text === null ? null : renderMarked(v.text, italics[vi]),
  }));
}

/** Parse one subtopic page into per-reference, text-resolved passages. */
function parseTopic(
  slug: string,
  title: string,
  body: string,
  refs: Record<Volume, ReferenceData>,
): Topic {
  const root = parse(body);
  const passages: Passage[] = [];

  // Main references live in <p class="entry"> elements (catchphrase + ref links);
  // the "See also" footer (<ul class="reference">) lists extra refs with no phrase.
  // Cache each entry's catchphrase segments so multiple refs in one entry share them.
  const segFor = new Map<HTMLElement, PhraseWord[][]>();
  for (const entry of root.querySelectorAll('.entry')) {
    segFor.set(entry, extractSegments(entry));
  }
  const closestEntry = (node: HTMLElement): HTMLElement | null => {
    let p = node.parentNode as HTMLElement | null;
    while (p && p.tagName) {
      if (p.classList?.contains('entry')) return p;
      p = p.parentNode as HTMLElement | null;
    }
    return null;
  };

  // Iterate in document order so main entries come first, "See also" refs last.
  for (const a of root.querySelectorAll('a.scripture-ref')) {
    const href = (a.getAttribute('href') ?? '').replace(/&amp;/g, '&');
    const m = href.match(/\/study\/scriptures\/(ot|nt|bofm|dc-testament|pgp)\/([^/]+)\/([^/?#]+)/);
    if (!m) continue;
    const volume = m[1];
    if (!isVolume(volume)) continue;
    const bookSlug = m[2];
    const chapter = decodeURIComponent(m[3]);
    const label = a.text.replace(/\s+/g, ' ').trim();

    if (volume !== 'dc-testament' && !BOOK_NAMES[volume][bookSlug]) {
      unmappedSlugs.add(`${volume}/${bookSlug}`);
    }

    // Build the display reference from the href (full book name + chapter + verses)
    // rather than the TG's abbreviated link text. This both spells books out in
    // full and gives continuation refs (e.g. "32:3") their book prefix. D&C stays
    // short. The verse list keeps the TG's nice ranges/commas from the label.
    const displayBook = volume === 'dc-testament' ? 'D&C' : BOOK_NAMES[volume][bookSlug] ?? bookSlug;
    const colon = label.lastIndexOf(':');
    const verseDisplay =
      colon !== -1
        ? label.slice(colon + 1).trim()
        : /[?&]id=p/.test(href)
          ? label.replace(/^[^0-9]*/, '').trim() // bare verse continuation, e.g. "6"
          : ''; // whole-chapter reference
    const reference = `${displayBook} ${chapter}${verseDisplay ? ':' + verseDisplay : ''}`;

    const entry = closestEntry(a);
    let verseNums = versesFromLabel(label);
    if (verseNums.length === 0) verseNums = versesFromHref(href);
    const versesText: VerseText[] = verseNums.map((num) => ({
      num,
      text: lookupVerse(refs, volume, bookSlug, chapter, num),
    }));
    const segments = entry ? segFor.get(entry) ?? [] : [];
    const verses = markVerses(versesText, segments);

    passages.push({
      reference,
      volume,
      bookSlug,
      chapter,
      churchUrl: `${SITE}${href}`, // verse-anchored href straight from the TG
      verses,
      chapterOnly: verses.length === 0,
      fromSeeAlso: !entry,
    });
  }

  const topic: Topic = { slug, title, refCount: passages.length, passages };

  // Redirect-only entries (e.g. "Jesus Christ, Son of God. See Jesus Christ,
  // Divine Sonship.") have no references — capture the cross-reference target.
  if (passages.length === 0) {
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
    console.log(`  ${title} — ${topic.refCount} passages`);
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
  const mainRefs = topics.reduce((n, t) => n + t.passages.filter((p) => !p.fromSeeAlso).length, 0);
  const withItalics = topics.reduce(
    (n, t) => n + t.passages.filter((p) => p.verses.some((v) => v.html?.includes('<em>'))).length,
    0,
  );
  const missing = topics.reduce(
    (n, t) => n + t.passages.reduce((m, p) => m + p.verses.filter((v) => v.html === null).length, 0),
    0,
  );
  console.log(`\n✓ Wrote ${topics.length} topics, ${totalRefs} references to src/data/topics.json`);
  console.log(`  catchphrase italicized inline in ${withItalics}/${mainRefs} main references`);
  if (missing) console.log(`  (${missing} cited verses had no text in the reference editions)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
