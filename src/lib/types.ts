// Shape of src/data/topics.json (produced by scripts/build-data.ts).

export interface Verse {
  num: string;
  // Verse text as safe HTML: catchphrase fragments in <em>, key words in <strong>.
  html: string | null;
}

export interface Passage {
  reference: string;
  volume: string;
  bookSlug: string;
  chapter: string;
  churchUrl: string;
  verses: Verse[];
  chapterOnly: boolean;
  fromSeeAlso: boolean;
}

export interface SeeAlso {
  slug: string;
  title: string;
  external?: boolean;
  url?: string;
}

export interface Topic {
  slug: string;
  title: string;
  refCount: number;
  passages: Passage[];
  seeAlso?: SeeAlso;
}

export interface TopicsData {
  generatedAt: string;
  topics: Topic[];
}
