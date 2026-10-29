import type { Extractor } from '../types';
import { findReaderImages, stripCandidates } from './generic';

const CHAPTER_PATH = /^\/manga\/([^/]+)\/chapter-([\d]+(?:[.-]\d+)?)/;

function titleCase(slug: string): string {
  return decodeURIComponent(slug)
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export const manganami: Extractor = {
  id: 'manganami',
  matches: (url) => /(^|\.)manganami\.com$/.test(url.hostname) && CHAPTER_PATH.test(url.pathname),
  async extract({ url, document, options }) {
    const [, slug = '', chapter = ''] = CHAPTER_PATH.exec(url.pathname)!;
    const pages = stripCandidates(findReaderImages(document, url.href, options.minSize));
    if (pages.length === 0) throw new Error('No chapter images found; the reader layout may have changed');
    return {
      extractor: 'manganami',
      site: 'manganami',
      series: titleCase(slug),
      chapter: chapter.replace('-', '.'),
      sourceUrl: url.href,
      referer: `${url.origin}/`,
      pages,
    };
  },
};
