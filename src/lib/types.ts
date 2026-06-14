// Shape of src/data/topics.json (produced by scripts/build-data.ts).

export interface Verse {
  num: string;
  text: string | null;
}

export interface Group {
  reference: string;
  volume: string;
  bookSlug: string;
  chapter: string;
  churchUrl: string;
  verses: Verse[];
  chapterOnly: boolean;
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
  groups: Group[];
  seeAlso?: SeeAlso;
}

export interface TopicsData {
  generatedAt: string;
  topics: Topic[];
}
