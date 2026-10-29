import type { Gallery } from './types';

const ILLEGAL = /[<>:"/\\|?*\u0000-\u001f\u007f]/g;
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i;
const MAX_SEGMENT = 120;

/** Make one path segment safe on Windows, macOS and Linux. */
export function sanitizeSegment(input: string): string {
  let s = input.replace(ILLEGAL, '_').replace(/\s+/g, ' ').trim();
  s = s.replace(/^\.+/, '').replace(/[. ]+$/, '');
  if (s.length > MAX_SEGMENT) s = s.slice(0, MAX_SEGMENT).replace(/[. ]+$/, '');
  if (RESERVED.test(s)) s = `_${s}`;
  return s || '_';
}

/** "Vol.13 Ch.123 - The Good Old Days" style label; empty when nothing is known. */
export function chapterLabel(g: Pick<Gallery, 'volume' | 'chapter' | 'title'>): string {
  const head = [g.volume && `Vol.${g.volume}`, g.chapter && `Ch.${g.chapter}`].filter(Boolean).join(' ');
  if (head && g.title) return `${head} - ${g.title}`;
  return head || g.title || '';
}

export function folderPath(baseFolder: string, template: string, g: Gallery): string {
  const tokens: Record<string, string> = {
    site: g.site,
    series: g.series,
    chapter: chapterLabel(g),
    title: g.title ?? '',
  };
  const segments = template
    .split('/')
    .map((part) => part.replace(/\{(\w+)\}/g, (_, key: string) => tokens[key] ?? ''))
    .filter((part) => part.trim() !== '')
    .map(sanitizeSegment);
  const base = baseFolder.split('/').filter((p) => p.trim() !== '').map(sanitizeSegment);
  return [...base, ...segments].join('/');
}

/** Zero-padded page stems: 001, 002, … (wider when there are 1000+ pages). */
export function pageNames(count: number): string[] {
  const width = Math.max(3, String(count).length);
  return Array.from({ length: count }, (_, i) => String(i + 1).padStart(width, '0'));
}

const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/bmp': 'bmp',
  'image/svg+xml': 'svg',
};

export function extensionFor(contentType: string | null, url: string): string {
  const type = contentType?.split(';')[0]?.trim().toLowerCase();
  const known = type && EXT_BY_TYPE[type];
  if (known) return known;
  const match = /\.([a-z0-9]{3,4})(?:$|[?#])/i.exec(new URL(url).pathname);
  const ext = match?.[1]?.toLowerCase();
  return ext === 'jpeg' ? 'jpg' : ext || 'jpg';
}

/** File name stem taken from a URL, for single-image downloads. */
export function stemFromUrl(url: string): string {
  const last = new URL(url).pathname.split('/').filter(Boolean).pop() ?? 'image';
  return sanitizeSegment(decodeURIComponent(last).replace(/\.[a-z0-9]{3,4}$/i, ''));
}
