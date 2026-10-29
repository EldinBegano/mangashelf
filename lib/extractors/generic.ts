import type { Extractor, GalleryPage } from '../types';

export interface Candidate extends GalleryPage {
  el: Element;
}

const LAZY_ATTRS = ['data-src', 'data-lazy-src', 'data-original', 'data-url', 'data-lazy', 'data-full', 'data-echo'];
const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif|bmp)(?:$|[?#])/i;
const MAX_STYLE_SCAN = 5000;

function resolve(raw: string | null | undefined, base: string): string | undefined {
  const value = raw?.trim();
  if (!value || /^(data|blob|javascript|about):/i.test(value)) return undefined;
  try {
    const url = new URL(value, base);
    if (!/^https?:$/.test(url.protocol) || /\.svg(?:$|[?#])/i.test(url.pathname)) return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

/** Largest candidate of a srcset ("a.jpg 800w, b.jpg 2x"). */
export function bestFromSrcset(srcset: string | null, base: string): string | undefined {
  if (!srcset) return undefined;
  let best: { url: string; size: number } | undefined;
  for (const part of srcset.split(/,\s+/)) {
    const [raw, descriptor = '1x'] = part.trim().split(/\s+/);
    const size = parseFloat(descriptor) || 1;
    const url = resolve(raw, base);
    if (url && (!best || size > best.size)) best = { url, size };
  }
  return best?.url;
}

function imgSource(img: HTMLImageElement, base: string): string | undefined {
  for (const attr of LAZY_ATTRS) {
    const url = resolve(img.getAttribute(attr), base);
    if (url) return url;
  }
  return (
    bestFromSrcset(img.getAttribute('data-srcset'), base) ??
    bestFromSrcset(img.getAttribute('srcset'), base) ??
    resolve(img.currentSrc, base) ??
    resolve(img.getAttribute('src'), base)
  );
}

function knownSize(n: number | undefined): number | undefined {
  return n && n > 0 ? n : undefined;
}

function tooSmall(c: GalleryPage, minSize: number): boolean {
  return (c.width !== undefined && c.width < minSize) || (c.height !== undefined && c.height < minSize);
}

/** All image-like resources in document order, deduplicated by URL. */
export function collectImages(doc: Document, base: string, minSize: number, imgOnly = false): Candidate[] {
  const out: Candidate[] = [];
  const seen = new Map<string, Candidate>();
  const add = (c: Candidate) => {
    if (tooSmall(c, minSize)) return;
    const prev = seen.get(c.url);
    if (prev) {
      prev.thumb ??= c.thumb;
      return;
    }
    seen.set(c.url, c);
    out.push(c);
  };

  for (const img of doc.querySelectorAll('img')) {
    const src = imgSource(img, base);
    const link = img.closest('a[href]')?.getAttribute('href');
    const linked = link && IMAGE_EXT.test(link) ? resolve(link, base) : undefined;
    if (linked) {
      add({ url: linked, thumb: src, el: img });
    } else if (src) {
      add({
        url: src,
        el: img,
        width: knownSize(img.naturalWidth) ?? knownSize(parseInt(img.getAttribute('width') ?? '', 10)),
        height: knownSize(img.naturalHeight) ?? knownSize(parseInt(img.getAttribute('height') ?? '', 10)),
      });
    }
  }
  if (imgOnly) return out;

  for (const a of doc.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href');
    if (href && IMAGE_EXT.test(href) && !a.querySelector('img')) {
      const url = resolve(href, base);
      if (url) add({ url, el: a });
    }
  }

  const view = doc.defaultView;
  const all = [...(doc.body?.querySelectorAll('*') ?? [])].slice(0, MAX_STYLE_SCAN);
  for (const el of all) {
    const bg = view?.getComputedStyle(el).backgroundImage || (el as HTMLElement).style?.backgroundImage;
    if (!bg || bg === 'none') continue;
    for (const match of bg.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
      const url = resolve(match[1], base);
      if (!url) continue;
      const rect = el.getBoundingClientRect();
      add({ url, el, width: knownSize(rect.width), height: knownSize(rect.height) });
    }
  }
  return out;
}

/**
 * Structural fingerprint of an image's three nearest ancestors, e.g.
 * "DIV.page-break<DIV.reading-content<MAIN". The image's own classes and any
 * class containing digits are ignored, since lazy loaders and page numbers vary them.
 */
function ancestorSignature(el: Element): string {
  const parts: string[] = [];
  let p = el.parentElement;
  for (let level = 0; level < 3 && p; level++, p = p.parentElement) {
    const classes = [...p.classList].filter((c) => !/\d/.test(c)).sort().join('.');
    parts.push(classes ? `${p.tagName}.${classes}` : p.tagName);
  }
  return parts.join('<');
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

/**
 * How much a group of same-shaped images looks like reader pages: more images
 * score higher, wide on-screen images much higher, and images that link to other
 * pages (cover tiles, "related" lists) count half.
 */
function readerScore(group: Candidate[]): number {
  const widths = group.map((c) => c.el.getBoundingClientRect().width).filter((w) => w > 0);
  const navLinks = group.filter((c) => c.thumb === undefined && c.el.closest('a[href]')).length;
  let score = group.length;
  if (widths.length) score *= Math.min(median(widths), 1000) / 100;
  if (navLinks > group.length / 2) score *= 0.5;
  return score;
}

/**
 * Images of the main reader: reader pages share one markup pattern, while logos,
 * covers and ads each have their own. Groups images by ancestor signature and
 * picks the best-scoring group; falls back to every image when no group has two.
 */
export function findReaderImages(doc: Document, base: string, minSize: number): Candidate[] {
  const candidates = collectImages(doc, base, minSize, true);
  const groups = new Map<string, Candidate[]>();
  for (const c of candidates) {
    const key = ancestorSignature(c.el);
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  let best: Candidate[] = [];
  let bestScore = 0;
  for (const group of groups.values()) {
    const score = group.length >= 2 ? readerScore(group) : 0;
    if (score > bestScore) [best, bestScore] = [group, score];
  }
  return best.length ? best : candidates;
}

export function stripCandidates(candidates: Candidate[]): GalleryPage[] {
  return candidates.map(({ el: _el, ...page }) => page);
}

export const generic: Extractor = {
  id: 'generic',
  matches: () => true,
  async extract({ url, document, options }) {
    const pages = stripCandidates(collectImages(document, url.href, options.minSize));
    return {
      extractor: 'generic',
      site: url.hostname.replace(/^www\./, ''),
      series: document.title.trim() || url.hostname,
      sourceUrl: url.href,
      referer: url.href,
      pages,
    };
  },
};
