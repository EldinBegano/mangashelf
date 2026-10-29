import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchImage, retryAfterMs } from '../lib/fetch-image';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
const png = () => new Response(PNG, { headers: { 'content-type': 'image/png' } });

afterEach(() => vi.unstubAllGlobals());

describe('retryAfterMs', () => {
  const now = Date.parse('2026-10-29T12:00:00Z');

  it.each([
    ['5', 5000],
    ['0', 0],
    ['Thu, 29 Oct 2026 12:00:10 GMT', 10_000],
    ['Thu, 29 Oct 2026 11:00:00 GMT', 0],
    ['3600', 60_000],
  ])('%s → %i ms', (header, ms) => {
    expect(retryAfterMs(header, now)).toBe(ms);
  });

  it.each([null, '', 'soon'])('ignores %j', (header) => {
    expect(retryAfterMs(header, now)).toBeUndefined();
  });
});

describe('fetchImage', () => {
  it('stops waiting to retry once aborted', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 429, headers: { 'retry-after': '30' } })));
    const controller = new AbortController();
    const pending = fetchImage(['https://cdn.example.com/1.png'], controller.signal);
    setTimeout(() => controller.abort(), 10);
    await expect(pending).rejects.toThrow(/abort/i);
  });

  it('waits as long as a 429 asks, then retries', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('slow down', { status: 429, headers: { 'retry-after': '0' } }))
      .mockResolvedValueOnce(png());
    vi.stubGlobal('fetch', fetch);
    await expect(fetchImage(['https://cdn.example.com/1.png'])).resolves.toMatchObject({ ext: 'png' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('moves on to the fallback without retrying a 404', async () => {
    const fetch = vi.fn(async (url: string) => (url.includes('dead') ? new Response('', { status: 404 }) : png()));
    vi.stubGlobal('fetch', fetch);
    await fetchImage(['https://dead.example.com/1.png', 'https://cdn.example.com/1.png']);
    expect(fetch.mock.calls.map(([url]) => url)).toEqual(['https://dead.example.com/1.png', 'https://cdn.example.com/1.png']);
  });

  it('gives every request a timeout', async () => {
    const fetch = vi.fn(async () => png());
    vi.stubGlobal('fetch', fetch);
    await fetchImage(['https://cdn.example.com/1.png']);
    expect(fetch).toHaveBeenCalledWith('https://cdn.example.com/1.png', expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });
});
