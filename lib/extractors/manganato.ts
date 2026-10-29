import type { Extractor } from '../types';
import { collectImages, findReaderImages, stripCandidates } from './generic';

/** Manganato / Mangakakalot sites; they share one template and image host (2xstorage.com). */
const HOSTS = ['manganami.com', 'manganato.gg', 'kakamanga.com', 'nelomanga.net', 'natomanga.com', 'mangakakalot.gg'];
const CHAPTER_PATH = /^\/manga\/([^/]+)\/chapter-([\d]+(?:[.-]\d+)?)/;

function titleCase(slug: string): string {
  return decodeURIComponent(slug)
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export const manganato: Extractor = {
  id: 'manganato',
  matches: (url) =>
    HOSTS.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`)) && CHAPTER_PATH.test(url.pathname),
  async extract({ url, document, options }) {
    const [, slug = '', chapter = ''] = CHAPTER_PATH.exec(url.pathname)!;
    const reader = document.querySelector('.container-chapter-reader');
    // Inside the known reader every image is a page, however narrow.
    const candidates = reader
      ? collectImages(document, url.href, 0, true).filter((c) => reader.contains(c.el))
      : findReaderImages(document, url.href, options.minSize);
    const pages = stripCandidates(candidates);
    if (pages.length === 0) throw new Error('No chapter images found; the reader layout may have changed');
    return {
      extractor: 'manganato',
      site: url.hostname.replace(/^www\./, '').replace(/\.[a-z]+$/, ''),
      series: titleCase(slug),
      chapter: chapter.replace('-', '.'),
      sourceUrl: url.href,
      // The image host answers 403 without a Referer from one of these sites.
      referer: `${url.origin}/`,
      pages,
    };
  },
};
