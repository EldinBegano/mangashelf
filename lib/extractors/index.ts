import type { ExtractCtx, ExtractOptions, Extractor, Gallery } from '../types';
import { generic } from './generic';
import { manganami } from './manganami';
import { mangadex } from './mangadex';

/** Site adapters, most specific first; `generic` matches everything. */
export const EXTRACTORS: Extractor[] = [mangadex, manganami, generic];

export function pickExtractor(url: URL): Extractor {
  return EXTRACTORS.find((e) => e.matches(url)) ?? generic;
}

export function getExtractor(id: string): Extractor | undefined {
  return EXTRACTORS.find((e) => e.id === id);
}

export async function fetchJson<T>(url: string): Promise<T> {
  // Default credentials: cookies for same-origin APIs (Cloudflare), none cross-origin (CORS `*`).
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json() as Promise<T>;
}

/** Cloudflare's interstitial ("Just a moment...") replaces the real page until it passes. */
export function isChallengePage(doc: Document): boolean {
  return /^just a moment/i.test(doc.title.trim()) || doc.querySelector('#challenge-form, #challenge-stage') !== null;
}

export interface ScanResult {
  gallery: Gallery;
  /** Set when the site adapter failed and the generic scan was used instead. */
  warning?: string;
}

export async function scanDocument(
  href: string,
  document: Document,
  options: ExtractOptions,
  fetcher: ExtractCtx['fetchJson'] = fetchJson,
): Promise<ScanResult> {
  if (isChallengePage(document)) {
    throw new Error('The site is still showing its Cloudflare check. Wait until the page loads, then try again.');
  }
  const ctx: ExtractCtx = { url: new URL(href), document, options, fetchJson: fetcher };
  const extractor = pickExtractor(ctx.url);
  try {
    return { gallery: await extractor.extract(ctx) };
  } catch (err) {
    if (extractor === generic) throw err;
    const warning = `${extractor.id}: ${err instanceof Error ? err.message : String(err)}. Showing all page images instead.`;
    return { gallery: await generic.extract(ctx), warning };
  }
}
