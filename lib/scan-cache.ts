import { browser } from 'wxt/browser';
import type { ScanResult } from './extractors';
import type { ExtractOptions, Gallery } from './types';

/**
 * How long a site adapter's scan is reused as is. Adapters read an API or the page's HTML,
 * which doesn't change while the tab stays on the chapter. MangaDex page links last about
 * 15 minutes, and a job renews them if they expire anyway.
 */
export const SCAN_TTL_MS = 10 * 60_000;

interface Entry {
  url: string;
  options: ExtractOptions;
  result: ScanResult;
  at: number;
}

export interface CachedScan {
  result: ScanResult;
  /** Good to use without scanning again. */
  fresh: boolean;
}

const PREFIX = 'scan:';
const key = (tabId: number) => `${PREFIX}${tabId}`;

const sameOptions = (a: ExtractOptions, b: ExtractOptions) =>
  a.minSize === b.minSize && a.mangadexQuality === b.mangadexQuality;

/**
 * Keep a tab's last scan in session storage, so the popup can show it the moment it opens.
 * Callers leave private tabs out.
 */
export async function cacheScan(tabId: number, url: string, options: ExtractOptions, result: ScanResult): Promise<void> {
  const store = browser.storage.session;
  if (!store) return;
  const entry: Entry = { url, options, result, at: Date.now() };
  const item = { [key(tabId)]: entry };
  try {
    await store.set(item);
  } catch {
    // Over quota (10 MB in Chrome): drop the other tabs' scans and try once more.
    try {
      const all = await store.get(null);
      await store.remove(Object.keys(all).filter((k) => k.startsWith(PREFIX)));
      await store.set(item);
    } catch {
      // Only a cache.
    }
  }
}

/** The tab's last scan, if it was of this URL with these options. */
export async function cachedScan(
  tabId: number,
  url: string,
  options: ExtractOptions,
  now = Date.now(),
): Promise<CachedScan | undefined> {
  const stored = await browser.storage.session?.get(key(tabId)).catch(() => undefined);
  const entry = stored?.[key(tabId)] as Entry | undefined;
  if (!entry || entry.url !== url || !sameOptions(entry.options, options)) return undefined;
  // The generic picker reads the live page, which keeps changing as images lazy-load.
  const fresh = entry.result.gallery.extractor !== 'generic' && now - entry.at < SCAN_TTL_MS;
  return { result: entry.result, fresh };
}

export function forgetScan(tabId: number): void {
  browser.storage.session?.remove(key(tabId)).catch(() => {});
}

/**
 * The scan to use when the tab was scanned before. A generic rescan that finds nothing new
 * keeps the earlier result: after a reload or without scrolling, lazy pages haven't loaded
 * yet, but the pages an earlier "Scroll & rescan" found still belong to the chapter.
 */
export function richerScan(previous: ScanResult | undefined, fresh: ScanResult): ScanResult {
  const [old, now] = [previous?.gallery, fresh.gallery];
  if (old?.extractor !== 'generic' || now.extractor !== 'generic' || old.pages.length <= now.pages.length) return fresh;
  const known = new Set(old.pages.map((p) => p.url));
  return now.pages.every((p) => known.has(p.url)) ? previous! : fresh;
}

/**
 * The selection to keep when a newer scan replaces the one on screen. With the same number
 * of pages it stays by position (MangaDex links get re-signed, lazy images swap their
 * placeholder URL). Otherwise it follows the URLs, and pages that are new get the default.
 */
export function carrySelection(prev: Gallery, next: Gallery, selected: ReadonlySet<number>): number[] {
  if (prev.pages.length === next.pages.length) return [...selected].filter((i) => i < next.pages.length);
  const was = new Map(prev.pages.map((p, i) => [p.url, selected.has(i)]));
  const defaults = new Set(next.preselect ?? next.pages.keys());
  return next.pages.flatMap((p, i) => ((was.get(p.url) ?? defaults.has(i)) ? [i] : []));
}
