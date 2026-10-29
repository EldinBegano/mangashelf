import { describe, expect, it } from 'vitest';
import { pickExtractor, scanDocument } from '../lib/extractors';
import { collectImages, findReaderImages } from '../lib/extractors/generic';
import { fixture, htmlDocument, options, routes } from './helpers';

const MANGADEX_URL = 'https://mangadex.org/chapter/aacc7c69-798c-4e0c-a237-87e8b9d264e6/1';
const MANGANAMI_URL = 'https://www.manganami.com/manga/berserk/chapter-164';
const empty = () => htmlDocument('<html><body></body></html>');

describe('pickExtractor', () => {
  it.each([
    [MANGADEX_URL, 'mangadex'],
    ['https://mangadex.org/title/c86edee1-807b-4e17-b524-291ac7c2f650', 'generic'],
    [MANGANAMI_URL, 'manganato'],
    ['https://www.kakamanga.com/manga/the-lazy-aristocrat/chapter-16', 'manganato'],
    ['https://www.manganato.gg/manga/the-lazy-aristocrat/chapter-16.5', 'manganato'],
    ['https://www.manganami.com/manga/berserk', 'generic'],
    ['https://example.com/', 'generic'],
  ])('%s → %s', (url, id) => {
    expect(pickExtractor(new URL(url)).id).toBe(id);
  });
});

describe('mangadex', () => {
  const fetchJson = routes({
    '/chapter/': 'mangadex-chapter.json',
    '/at-home/server/': 'mangadex-at-home.json',
    '/manga/': 'mangadex-manga.json',
  });

  it('builds the chapter from the API', async () => {
    const { gallery, warning } = await scanDocument(MANGADEX_URL, empty(), options, fetchJson);
    expect(warning).toBeUndefined();
    expect(gallery).toMatchObject({
      extractor: 'mangadex',
      series: 'Lost Man',
      volume: '13',
      chapter: '123',
      title: 'The Good Old Days...',
      language: 'en',
    });
    expect(gallery.pages).toHaveLength(19);
    const first = gallery.pages[0]!;
    expect(first.url).toMatch(/^https:\/\/[^/]+\/data\/706b5aaec8d1e8872f59b61ceabc4998\/1-[0-9a-f]+\.jpg$/);
    expect(first.fallbacks?.[0]).toMatch(/^https:\/\/uploads\.mangadex\.org\/data\//);
    expect(first.thumb).toContain('/data-saver/');
  });

  it('fills in series metadata for ComicInfo', async () => {
    const { gallery } = await scanDocument(MANGADEX_URL, empty(), options, fetchJson);
    expect(gallery).toMatchObject({
      originalLanguage: 'ja',
      writers: ['Kusaba Michiteru'],
      artists: ['Kusaba Michiteru'],
      groups: ['Example Scans'],
      genres: ['Romance', 'Sports', 'Drama'],
      tags: [],
      count: 168,
    });
    expect(gallery.summary).toMatch(/^There lives a man who has lost his memory/);
    expect(gallery.ageRating).toBeUndefined();
  });

  it('still scans the chapter when the series request fails', async () => {
    const partial = routes({ '/chapter/': 'mangadex-chapter.json', '/at-home/server/': 'mangadex-at-home.json' });
    const { gallery, warning } = await scanDocument(MANGADEX_URL, empty(), options, partial);
    expect(warning).toBeUndefined();
    expect(gallery.writers).toBeUndefined();
    expect(gallery.pages).toHaveLength(19);
  });

  it('uses data-saver files when asked', async () => {
    const { gallery } = await scanDocument(MANGADEX_URL, empty(), { ...options, mangadexQuality: 'data-saver' }, fetchJson);
    expect(gallery.pages[0]!.url).toContain('/data-saver/706b5aaec8d1e8872f59b61ceabc4998/');
  });

  it('refreshes expired page URLs', async () => {
    const { gallery } = await scanDocument(MANGADEX_URL, empty(), options, fetchJson);
    const fresh = await pickExtractor(new URL(MANGADEX_URL)).refresh!(gallery, fetchJson);
    expect(fresh.map((p) => p.url)).toEqual(gallery.pages.map((p) => p.url));
  });
});

describe('generic', () => {
  const doc = () => htmlDocument(fixture('reader.html'));
  const base = MANGANAMI_URL;

  it('collects lazy, srcset, linked and plain images; skips svg, data: and small ones', () => {
    const urls = collectImages(doc(), base, 300).map((c) => c.url);
    expect(urls).toEqual([
      'https://cdn.example.com/berserk/164/001.jpg',
      'https://cdn.example.com/berserk/164/002.jpg',
      'https://cdn.example.com/berserk/164/003.jpg',
      'https://cdn.example.com/berserk/164/004.jpg',
      'https://cdn.example.com/covers/a.jpg',
      'https://cdn.example.com/covers/b.jpg',
      'https://cdn.example.com/covers/c.jpg',
      'https://cdn.example.com/covers/d.jpg',
      'https://cdn.example.com/covers/e.jpg',
      'https://cdn.example.com/art/full.png',
      'https://cdn.example.com/art/other.webp',
    ]);
  });

  it('ignores the size of a lazy-load placeholder', () => {
    const page = htmlDocument(
      '<img src="https://c.example/blank.png" data-url="https://c.example/p1.jpg" width="700" height="1140">',
    );
    const img = page.querySelector('img')!;
    Object.defineProperties(img, {
      currentSrc: { value: 'https://c.example/blank.png' },
      naturalWidth: { value: 1 },
      naturalHeight: { value: 1 },
    });
    expect(collectImages(page, 'https://c.example/', 300)).toMatchObject([
      { url: 'https://c.example/p1.jpg', width: 700, height: 1140 },
    ]);
  });

  it('keeps the thumbnail of a linked full-size image', () => {
    const linked = collectImages(doc(), base, 300).find((c) => c.url.endsWith('full.png'));
    expect(linked?.thumb).toBe('https://cdn.example.com/art/thumb.png');
  });

  it('preselects only the reader pages', async () => {
    const { gallery } = await scanDocument('https://example.com/read/1', doc(), options, routes({}));
    expect(gallery.extractor).toBe('generic');
    expect(gallery.pages).toHaveLength(11);
    expect(gallery.preselect?.map((i) => gallery.pages[i]!.url)).toEqual(
      [1, 2, 3, 4].map((n) => `https://cdn.example.com/berserk/164/00${n}.jpg`),
    );
  });

  it('finds the reader pages even when other images outnumber them', () => {
    const urls = findReaderImages(doc(), base, 300).map((c) => c.url);
    expect(urls).toEqual([1, 2, 3, 4].map((n) => `https://cdn.example.com/berserk/164/00${n}.jpg`));
  });
});

describe('manganato', () => {
  it('takes every image of the chapter reader, in order', async () => {
    const doc = htmlDocument(fixture('manganato-chapter.html'));
    const { gallery } = await scanDocument(MANGANAMI_URL, doc, options, routes({}));
    expect(gallery).toMatchObject({
      extractor: 'manganato',
      site: 'manganami',
      series: 'Berserk',
      chapter: '164',
      referer: 'https://www.manganami.com/',
    });
    expect(gallery.pages.map((p) => p.url)).toEqual(
      [0, 1, 2, 3].map((n) => `https://img-r1.2xstorage.com/berserk/164/${n}.webp`),
    );
  });

  it('guesses the reader when the template changes', async () => {
    const { gallery } = await scanDocument(MANGANAMI_URL, htmlDocument(fixture('reader.html')), options, routes({}));
    expect(gallery.extractor).toBe('manganato');
    expect(gallery.pages).toHaveLength(4);
  });

  it('falls back to the generic scan with a warning when no reader is found', async () => {
    const { gallery, warning } = await scanDocument(MANGANAMI_URL, empty(), options, routes({}));
    expect(gallery.extractor).toBe('generic');
    expect(warning).toMatch(/^manganato: No chapter images found/);
  });
});

describe('scanDocument', () => {
  it('refuses Cloudflare challenge pages instead of scanning them', async () => {
    const doc = htmlDocument('<html><head><title>Just a moment...</title></head><body><img src="/favicon.ico"></body></html>');
    await expect(scanDocument(MANGANAMI_URL, doc, options, routes({}))).rejects.toThrow(/Cloudflare check/);
  });

  it('recognizes localized Cloudflare challenge pages by their script', async () => {
    const doc = htmlDocument(
      '<html><head><title>Nur einen Moment…</title><script src="/cdn-cgi/challenge-platform/h/g/orchestrate/chl_page/v1?ray=1"></script></head><body></body></html>',
    );
    await expect(scanDocument(MANGANAMI_URL, doc, options, routes({}))).rejects.toThrow(/Cloudflare check/);
  });
});

describe('findReaderImages with layout', () => {
  it('prefers wide on-screen images over a larger group of small tiles', () => {
    const doc = htmlDocument(`<body>
      <div class="strip"><img src="https://c.example/p1.jpg"><img src="https://c.example/p2.jpg"></div>
      <ul class="tiles">${[1, 2, 3, 4, 5].map((n) => `<li><img class="tile" src="https://c.example/t${n}.jpg"></li>`).join('')}</ul>
    </body>`);
    for (const img of doc.querySelectorAll('img')) {
      const width = img.classList.contains('tile') ? 120 : 800;
      img.getBoundingClientRect = () => ({ width, height: width * 1.4 }) as DOMRect;
    }
    const urls = findReaderImages(doc, 'https://c.example/', 300).map((c) => c.url);
    expect(urls).toEqual(['https://c.example/p1.jpg', 'https://c.example/p2.jpg']);
  });
});
