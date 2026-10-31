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

/**
 * Fill a folder template. A token can be padded with zeros, e.g. `{number:000}`: leading
 * digits are padded to that width ("7" → "007", "7.5" → "007.5"), so readers that sort by
 * file name keep chapters in order.
 */
export function folderPath(baseFolder: string, template: string, g: Gallery): string {
  const tokens: Record<string, string> = {
    site: g.site,
    series: g.series,
    chapter: chapterLabel(g),
    title: g.title ?? '',
    volume: g.volume ?? '',
    number: g.chapter ?? '',
    lang: g.language ?? '',
    group: g.groups?.join(', ') ?? '',
  };
  const fill = (key: string, pad?: string) => {
    const value = tokens[key] ?? '';
    return pad ? value.replace(/^\d+/, (digits) => digits.padStart(pad.length, '0')) : value;
  };
  const segments = template
    .split('/')
    .map((part) => part.replace(/\{(\w+)(?::(0+))?\}/g, (_, key: string, pad?: string) => fill(key, pad)))
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

/**
 * Image type from the file's first bytes. Servers sometimes label files wrongly
 * (JPEGs sent as image/png), and readers refuse files whose extension lies.
 */
export function sniffImage(bytes: Uint8Array): { type: string; ext: string } | undefined {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { type: 'image/jpeg', ext: 'jpg' };
  if (bytes[0] === 0x89 && ascii(1, 4) === 'PNG') return { type: 'image/png', ext: 'png' };
  if (ascii(0, 4) === 'GIF8') return { type: 'image/gif', ext: 'gif' };
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return { type: 'image/webp', ext: 'webp' };
  if (ascii(4, 12) === 'ftypavif' || ascii(4, 12) === 'ftypavis') return { type: 'image/avif', ext: 'avif' };
  if (ascii(0, 2) === 'BM') return { type: 'image/bmp', ext: 'bmp' };
  return undefined;
}

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
