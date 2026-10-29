import type { ExtractCtx, Extractor, GalleryPage, MangadexQuality } from '../types';

const API = 'https://api.mangadex.org';
const UPLOADS = 'https://uploads.mangadex.org';
const CHAPTER_PATH = /^\/chapter\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

type LocalizedString = Record<string, string>;

interface Relationship {
  id: string;
  type: string;
  /** Present when the request asked for this type with includes[]. */
  attributes?: unknown;
}

interface MangaAttributes {
  title?: LocalizedString;
  altTitles?: LocalizedString[];
  description?: LocalizedString;
  originalLanguage?: string;
  status?: string;
  lastChapter?: string | null;
  contentRating?: string;
  tags?: Array<{ attributes: { name: LocalizedString; group: string } }>;
}

interface ChapterResponse {
  data: {
    id: string;
    attributes: {
      volume: string | null;
      chapter: string | null;
      title: string | null;
      translatedLanguage: string;
      externalUrl: string | null;
    };
    relationships: Relationship[];
  };
}

interface MangaResponse {
  data: { relationships: Relationship[] };
}

interface AtHomeResponse {
  baseUrl: string;
  chapter: { hash: string; data: string[]; dataSaver: string[] };
}

interface RefreshData {
  chapterId: string;
  quality: MangadexQuality;
}

/** MangaDex content ratings as ComicInfo AgeRating values; "safe" makes no age claim. */
const AGE_RATING: Record<string, string> = {
  suggestive: 'Teen',
  erotica: 'Mature 17+',
  pornographic: 'Adults Only 18+',
};

export function chapterIdFrom(url: URL): string | undefined {
  return CHAPTER_PATH.exec(url.pathname)?.[1]?.toLowerCase();
}

function mangaTitle(title: LocalizedString = {}, altTitles: LocalizedString[] = []): string | undefined {
  return (
    title.en ??
    altTitles.find((t) => t.en)?.en ??
    title['ja-ro'] ??
    Object.values(title)[0]
  );
}

function related<T>(relationships: Relationship[], type: string): T[] {
  return relationships.flatMap((r) => (r.type === type && r.attributes ? [r.attributes as T] : []));
}

const localized = (s: LocalizedString = {}, lang?: string): string | undefined =>
  (lang && s[lang]) || s.en || Object.values(s)[0];

/** Author and artist names. They belong to the manga, not the chapter, so they need a second request. */
async function creators(chapter: ChapterResponse, fetchJson: ExtractCtx['fetchJson']) {
  const mangaId = chapter.data.relationships.find((r) => r.type === 'manga')?.id;
  if (!mangaId) return {};
  try {
    const { data } = await fetchJson<MangaResponse>(`${API}/manga/${mangaId}?includes[]=author&includes[]=artist`);
    const names = (type: string) => related<{ name: string }>(data.relationships, type).map((p) => p.name);
    return { writers: names('author'), artists: names('artist') };
  } catch {
    // Only metadata; the chapter downloads fine without it.
    return {};
  }
}

export function pagesFromAtHome(home: AtHomeResponse, quality: MangadexQuality): GalleryPage[] {
  const { hash, data, dataSaver } = home.chapter;
  const files = quality === 'data' ? data : dataSaver;
  return files.map((file, i) => ({
    url: `${home.baseUrl}/${quality}/${hash}/${file}`,
    fallbacks: home.baseUrl === UPLOADS ? [] : [`${UPLOADS}/${quality}/${hash}/${file}`],
    thumb: dataSaver[i] ? `${home.baseUrl}/data-saver/${hash}/${dataSaver[i]}` : undefined,
  }));
}

async function atHome(chapterId: string, fetchJson: ExtractCtx['fetchJson']) {
  return fetchJson<AtHomeResponse>(`${API}/at-home/server/${chapterId}`);
}

export const mangadex: Extractor = {
  id: 'mangadex',
  matches: (url) => /(^|\.)mangadex\.org$/.test(url.hostname) && chapterIdFrom(url) !== undefined,
  async extract({ url, options, fetchJson }) {
    const chapterId = chapterIdFrom(url)!;
    const chapterRequest = fetchJson<ChapterResponse>(`${API}/chapter/${chapterId}?includes[]=manga&includes[]=scanlation_group`);
    const [chapter, home, people] = await Promise.all([
      chapterRequest,
      atHome(chapterId, fetchJson),
      chapterRequest.then((c) => creators(c, fetchJson)),
    ]);
    const attrs = chapter.data.attributes;
    if (attrs.externalUrl) throw new Error(`Chapter is hosted externally: ${attrs.externalUrl}`);
    const manga = related<MangaAttributes>(chapter.data.relationships, 'manga')[0];
    const tagNames = (pick: (group: string) => boolean) =>
      (manga?.tags ?? []).flatMap(({ attributes: t }) => (pick(t.group) ? [localized(t.name) ?? ''] : [])).filter(Boolean);
    const lastChapter = manga?.lastChapter ?? '';
    const quality = options.mangadexQuality;
    return {
      extractor: 'mangadex',
      site: 'mangadex',
      series: mangaTitle(manga?.title, manga?.altTitles) ?? chapterId,
      volume: attrs.volume ?? undefined,
      chapter: attrs.chapter ?? undefined,
      title: attrs.title || undefined,
      language: attrs.translatedLanguage,
      originalLanguage: manga?.originalLanguage,
      summary: localized(manga?.description, attrs.translatedLanguage),
      ...people,
      groups: related<{ name: string }>(chapter.data.relationships, 'scanlation_group').map((g) => g.name),
      genres: tagNames((group) => group === 'genre'),
      // Themes, formats ("Long Strip") and content warnings.
      tags: tagNames((group) => group !== 'genre'),
      ageRating: AGE_RATING[manga?.contentRating ?? ''],
      count: manga?.status === 'completed' && /^\d+$/.test(lastChapter) ? Number(lastChapter) : undefined,
      sourceUrl: url.href,
      pages: pagesFromAtHome(home, quality),
      refresh: { chapterId, quality } satisfies RefreshData,
    };
  },
  // at-home base URLs expire after ~15 minutes; fetch a fresh one.
  async refresh(gallery, fetchJson) {
    const { chapterId, quality } = gallery.refresh as RefreshData;
    return pagesFromAtHome(await atHome(chapterId, fetchJson), quality);
  },
};
