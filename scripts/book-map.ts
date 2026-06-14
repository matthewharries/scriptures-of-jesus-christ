// Maps churchofjesuschrist.org scripture URL slugs to the book-name keys used by
// the bcbooks/scriptures-json `reference/` editions.
//
// A church scripture URL looks like:
//   /study/scriptures/{volume}/{bookSlug}/{chapter}?lang=eng&id=p{verse}#p{verse}
//
// `volume` selects which reference file to load; `bookSlug` selects the book key
// within it. Doctrine & Covenants is special: its reference file is keyed by
// section number directly (data[section][verse]) rather than by a book name.

export type Volume = 'ot' | 'nt' | 'bofm' | 'dc-testament' | 'pgp';

/** Reference file (in .cache / committed data) that backs each church volume. */
export const VOLUME_FILE: Record<Volume, string> = {
  ot: 'old-testament-reference.json',
  nt: 'new-testament-reference.json',
  bofm: 'book-of-mormon-reference.json',
  'dc-testament': 'doctrine-and-covenants-reference.json',
  pgp: 'pearl-of-great-price-reference.json',
};

// Per-volume bookSlug -> exact JSON book key. Verified against the downloaded
// reference files (note "Solomon's Song" and the em-dashes in the PoGP names).
export const BOOK_NAMES: Record<Volume, Record<string, string>> = {
  ot: {
    gen: 'Genesis', ex: 'Exodus', lev: 'Leviticus', num: 'Numbers',
    deut: 'Deuteronomy', josh: 'Joshua', judg: 'Judges', ruth: 'Ruth',
    '1-sam': '1 Samuel', '2-sam': '2 Samuel', '1-kgs': '1 Kings', '2-kgs': '2 Kings',
    '1-chr': '1 Chronicles', '2-chr': '2 Chronicles', ezra: 'Ezra', neh: 'Nehemiah',
    esth: 'Esther', job: 'Job', ps: 'Psalms', prov: 'Proverbs', eccl: 'Ecclesiastes',
    song: "Solomon's Song", isa: 'Isaiah', jer: 'Jeremiah', lam: 'Lamentations',
    ezek: 'Ezekiel', dan: 'Daniel', hosea: 'Hosea', joel: 'Joel', amos: 'Amos',
    obad: 'Obadiah', jonah: 'Jonah', micah: 'Micah', nahum: 'Nahum', hab: 'Habakkuk',
    zeph: 'Zephaniah', hag: 'Haggai', zech: 'Zechariah', mal: 'Malachi',
  },
  nt: {
    matt: 'Matthew', mark: 'Mark', luke: 'Luke', john: 'John', acts: 'Acts',
    rom: 'Romans', '1-cor': '1 Corinthians', '2-cor': '2 Corinthians',
    gal: 'Galatians', eph: 'Ephesians', philip: 'Philippians', col: 'Colossians',
    '1-thes': '1 Thessalonians', '2-thes': '2 Thessalonians', '1-tim': '1 Timothy',
    '2-tim': '2 Timothy', titus: 'Titus', philem: 'Philemon', heb: 'Hebrews',
    james: 'James', '1-pet': '1 Peter', '2-pet': '2 Peter', '1-jn': '1 John',
    '2-jn': '2 John', '3-jn': '3 John', jude: 'Jude', rev: 'Revelation',
  },
  bofm: {
    '1-ne': '1 Nephi', '2-ne': '2 Nephi', jacob: 'Jacob', enos: 'Enos',
    jarom: 'Jarom', omni: 'Omni', 'w-of-m': 'Words of Mormon', mosiah: 'Mosiah',
    alma: 'Alma', hel: 'Helaman', '3-ne': '3 Nephi', '4-ne': '4 Nephi',
    morm: 'Mormon', ether: 'Ether', moro: 'Moroni',
  },
  // D&C is keyed by section number in the reference file; the only book slug is
  // `dc`. `od` (Official Declarations) is not in the JSON -> handled as fallback.
  'dc-testament': {
    dc: 'Doctrine and Covenants',
  },
  pgp: {
    moses: 'Moses', abr: 'Abraham', 'js-m': 'Joseph Smith—Matthew',
    'js-h': 'Joseph Smith—History', 'a-of-f': 'Articles of Faith',
  },
};

export const VOLUMES = Object.keys(VOLUME_FILE) as Volume[];

export function isVolume(v: string): v is Volume {
  return v in VOLUME_FILE;
}
