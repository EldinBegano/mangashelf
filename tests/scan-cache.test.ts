import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Gallery } from '../lib/types';

const store = new Map<string, unknown>();
const session = {
  get: async (key: string | null) =>
    key === null ? Object.fromEntries(store) : store.has(key) ? { [key]: structuredClone(store.get(key)) } : {},
  set: async (items: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(items)) store.set(k, structuredClone(v));
  },
  remove: async (keys: string | string[]) => {
    for (const k of [keys].flat()) store.delete(k);
  },
};
vi.mock('wxt/browser', () => ({ browser: { storage: { session } } }));

const { cacheScan, cachedScan, carrySelection, forgetScan, richerScan, SCAN_TTL_MS } = await import('../lib/scan-cache');

const gallery = (urls: string[], patch: Partial<Gallery> = {}): Gallery => ({
  extractor: 'mangadex',
  site: 'mangadex',
  series: 'x',
  sourceUrl: 'https://mangadex.org/chapter/1',
  pages: urls.map((url) => ({ url })),
  ...patch,
});

const options = { minSize: 300, mangadexQuality: 'data' as const };
const url = 'https://mangadex.org/chapter/1';

beforeEach(() => store.clear());

describe('cachedScan', () => {
  it('returns a site scan of the same URL as fresh until it expires', async () => {
    await cacheScan(1, url, options, { gallery: gallery(['a']) });
    expect(await cachedScan(1, url, options)).toMatchObject({ fresh: true, result: { gallery: { pages: [{ url: 'a' }] } } });
    expect((await cachedScan(1, url, options, Date.now() + SCAN_TTL_MS + 1))?.fresh).toBe(false);
  });

  it('never calls a generic scan fresh', async () => {
    await cacheScan(1, url, options, { gallery: gallery(['a'], { extractor: 'generic' }) });
    expect((await cachedScan(1, url, options))?.fresh).toBe(false);
  });

  it('misses for another URL, other options, another tab or a closed tab', async () => {
    await cacheScan(1, url, options, { gallery: gallery(['a']) });
    expect(await cachedScan(1, 'https://mangadex.org/chapter/2', options)).toBeUndefined();
    expect(await cachedScan(1, url, { ...options, mangadexQuality: 'data-saver' })).toBeUndefined();
    expect(await cachedScan(2, url, options)).toBeUndefined();
    forgetScan(1);
    await Promise.resolve();
    expect(await cachedScan(1, url, options)).toBeUndefined();
  });

  it('clears older scans when storage is full', async () => {
    await cacheScan(1, url, options, { gallery: gallery(['a']) });
    const set = vi.spyOn(session, 'set').mockRejectedValueOnce(new Error('QUOTA_BYTES quota exceeded'));
    await cacheScan(2, url, options, { gallery: gallery(['b']) });
    set.mockRestore();
    expect(await cachedScan(1, url, options)).toBeUndefined();
    expect(await cachedScan(2, url, options)).toBeDefined();
  });
});

describe('carrySelection', () => {
  it('keeps positions when the page count is unchanged', () => {
    expect(carrySelection(gallery(['a', 'b', 'c']), gallery(['x', 'y', 'z']), new Set([0, 2]))).toEqual([0, 2]);
  });

  it('follows URLs when pages were added, and new pages get the default', () => {
    const prev = gallery(['a', 'b']);
    const next = gallery(['new', 'a', 'b', 'tiny'], { preselect: [0, 1, 2] });
    expect(carrySelection(prev, next, new Set([1]))).toEqual([0, 2]);
  });
});

describe('richerScan', () => {
  const generic = (urls: string[]) => ({ gallery: gallery(urls, { extractor: 'generic' }) });

  it('keeps an earlier generic scan when the new one finds nothing it lacks', () => {
    const earlier = generic(['a', 'b', 'c']);
    expect(richerScan(earlier, generic(['a']))).toBe(earlier);
  });

  it('takes the new scan when it finds new images, has as many, or is a site scan', () => {
    const fresh = generic(['a', 'z']);
    expect(richerScan(generic(['a', 'b', 'c']), fresh)).toBe(fresh);
    const same = generic(['a', 'b']);
    expect(richerScan(generic(['a', 'b']), same)).toBe(same);
    const site = { gallery: gallery(['a']) };
    expect(richerScan({ gallery: gallery(['a', 'b']) }, site)).toBe(site);
    expect(richerScan(undefined, fresh)).toBe(fresh);
  });
});
