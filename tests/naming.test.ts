import { describe, expect, it } from 'vitest';
import { chapterLabel, extensionFor, folderPath, pageNames, sanitizeSegment, sniffImage, stemFromUrl } from '../lib/naming';
import type { Gallery } from '../lib/types';

const gallery = (patch: Partial<Gallery> = {}): Gallery => ({
  extractor: 'mangadex',
  site: 'mangadex',
  series: 'Lost Man',
  sourceUrl: 'https://mangadex.org/chapter/x',
  pages: [],
  ...patch,
});

describe('sanitizeSegment', () => {
  it.each([
    ['Re:Zero / Part 2?', 'Re_Zero _ Part 2_'],
    ['  many   spaces  ', 'many spaces'],
    ['...hidden', 'hidden'],
    ['trailing dots...', 'trailing dots'],
    ['CON', '_CON'],
    ['', '_'],
    ['a'.repeat(200), 'a'.repeat(120)],
  ])('%j → %j', (input, out) => {
    expect(sanitizeSegment(input)).toBe(out);
  });
});

describe('chapterLabel', () => {
  it('combines volume, chapter and title', () => {
    expect(chapterLabel({ volume: '13', chapter: '123', title: 'The Good Old Days...' })).toBe(
      'Vol.13 Ch.123 - The Good Old Days...',
    );
    expect(chapterLabel({ chapter: '5' })).toBe('Ch.5');
    expect(chapterLabel({ title: 'Oneshot' })).toBe('Oneshot');
    expect(chapterLabel({})).toBe('');
  });
});

describe('folderPath', () => {
  it('fills the template and sanitizes each segment', () => {
    const g = gallery({ volume: '13', chapter: '123', title: 'The Good Old Days...' });
    expect(folderPath('mangashelf', '{site}/{series}/{chapter}', g)).toBe(
      'mangashelf/mangadex/Lost Man/Vol.13 Ch.123 - The Good Old Days',
    );
  });

  it('drops empty segments', () => {
    const g = gallery({ site: 'example', series: 'Re:Zero' });
    expect(folderPath('mangashelf', '{site}/{series}/{chapter}', g)).toBe('mangashelf/example/Re_Zero');
  });

  it('allows a nested or empty base folder', () => {
    expect(folderPath('comics/manga/', '{series}', gallery())).toBe('comics/manga/Lost Man');
    expect(folderPath('', '{series}', gallery())).toBe('Lost Man');
  });
});

describe('pageNames', () => {
  it('pads to at least three digits', () => {
    expect(pageNames(3)).toEqual(['001', '002', '003']);
    expect(pageNames(1200)[0]).toBe('0001');
  });
});

describe('extensionFor', () => {
  it('prefers the content type, then the URL', () => {
    expect(extensionFor('image/webp; charset=binary', 'https://x/a.jpg')).toBe('webp');
    expect(extensionFor('application/octet-stream', 'https://x/a.JPEG?v=1')).toBe('jpg');
    expect(extensionFor(null, 'https://x/a.png')).toBe('png');
    expect(extensionFor(null, 'https://x/image')).toBe('jpg');
  });
});

describe('sniffImage', () => {
  const bytes = (...parts: Array<number[] | string>) =>
    new Uint8Array(parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p)));

  it.each([
    [bytes([0xff, 0xd8, 0xff, 0xe0]), 'jpg'],
    [bytes([0x89], 'PNG', [0x0d, 0x0a]), 'png'],
    [bytes('GIF89a'), 'gif'],
    [bytes('RIFF', [0, 0, 0, 0], 'WEBPVP8 '), 'webp'],
    [bytes([0, 0, 0, 0x1c], 'ftypavif'), 'avif'],
  ])('detects %#', (data, ext) => {
    expect(sniffImage(data)?.ext).toBe(ext);
  });

  it('returns nothing for unknown data', () => {
    expect(sniffImage(bytes('<html>'))).toBeUndefined();
  });
});

describe('stemFromUrl', () => {
  it('uses the decoded last path segment without extension', () => {
    expect(stemFromUrl('https://x/img/My%20Pic.png?w=1')).toBe('My Pic');
  });
});
