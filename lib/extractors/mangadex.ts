import type { ExtractCtx, Extractor, GalleryPage, MangadexQuality } from '../types';

const API = 'https://api.mangadex.org';
const UPLOADS = 'https://uploads.mangadex.org';
const CHAPTER_PATH = /^\/chapter\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

type LocalizedString = Record<string, string>;

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
    relationships: Array<{
      type: string;
      attributes?: { title?: LocalizedString; altTitles?: LocalizedString[] };
    }>;
  };
}

interface AtHomeResponse {
  baseUrl: string;
  chapter: { hash: string; data: string[]; dataSaver: string[] };
}

interface RefreshData {
  chapterId: string;
  quality: MangadexQuality;
}

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
    const [chapter, home] = await Promise.all([
      fetchJson<ChapterResponse>(`${API}/chapter/${chapterId}?includes[]=manga`),
      atHome(chapterId, fetchJson),
    ]);
    const attrs = chapter.data.attributes;
    if (attrs.externalUrl) throw new Error(`Chapter is hosted externally: ${attrs.externalUrl}`);
    const manga = chapter.data.relationships.find((r) => r.type === 'manga')?.attributes;
    const quality = options.mangadexQuality;
    return {
      extractor: 'mangadex',
      site: 'mangadex',
      series: mangaTitle(manga?.title, manga?.altTitles) ?? chapterId,
      volume: attrs.volume ?? undefined,
      chapter: attrs.chapter ?? undefined,
      title: attrs.title || undefined,
      language: attrs.translatedLanguage,
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
