import { strFromU8, unzipSync } from 'fflate';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { comicInfo } from '../lib/archive';
import { runJob } from '../lib/job-runner';
import type { Gallery, JobProgress, JobSpec } from '../lib/types';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

const gallery: Gallery = {
  extractor: 'generic',
  site: 'example',
  series: 'Series <1>',
  chapter: '2',
  sourceUrl: 'https://example.com/read/2',
  tags: ['action', 'drama'],
  pages: [
    { url: 'https://cdn.example.com/1.png' },
    { url: 'https://dead.example.com/2.png', fallbacks: ['https://cdn.example.com/2.png'] },
    { url: 'https://cdn.example.com/3.png' },
  ],
};

function spec(patch: Partial<JobSpec> = {}): JobSpec {
  return {
    id: 'job',
    gallery,
    pages: [0, 1, 2],
    format: 'folder',
    folder: 'mangashelf/example/Series _1_/Ch.2',
    names: ['001', '002', '003'],
    concurrency: 2,
    incognito: false,
    ...patch,
  };
}

function stubFetch(missing: string[] = []) {
  const fetch = vi.fn(async (url: string) => {
    if (url.includes('dead.example.com') || missing.some((m) => url.includes(m))) return new Response('nope', { status: 404 });
    return new Response(PNG, { headers: { 'content-type': 'image/png' } });
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

function hooks() {
  const saved: Array<{ filename: string; blob: Blob }> = [];
  const updates: JobProgress[] = [];
  return {
    saved,
    updates,
    save: async (blob: Blob, filename: string) => void saved.push({ filename, blob }),
    progress: (p: JobProgress) => void updates.push(p),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('runJob', () => {
  it('saves each page into the folder, using fallbacks', async () => {
    const fetch = stubFetch();
    const h = hooks();
    const result = await runJob(spec(), h);
    expect(result).toMatchObject({ status: 'done', done: 3, failed: [], total: 3 });
    expect(h.saved.map((s) => s.filename).sort()).toEqual([
      'mangashelf/example/Series _1_/Ch.2/001.png',
      'mangashelf/example/Series _1_/Ch.2/002.png',
      'mangashelf/example/Series _1_/Ch.2/003.png',
    ]);
    expect(fetch).toHaveBeenCalledWith('https://cdn.example.com/2.png', expect.anything());
    expect(h.updates[0]).toMatchObject({ status: 'running', done: 0 });
  });

  it('downloads only the selected pages with their original numbers', async () => {
    stubFetch();
    const h = hooks();
    await runJob(spec({ pages: [2], names: ['003'] }), h);
    expect(h.saved.map((s) => s.filename)).toEqual(['mangashelf/example/Series _1_/Ch.2/003.png']);
  });

  it('builds an ordered CBZ with ComicInfo.xml', async () => {
    stubFetch();
    const h = hooks();
    const result = await runJob(spec({ format: 'cbz' }), h);
    expect(result.status).toBe('done');
    expect(h.saved).toHaveLength(1);
    expect(h.saved[0]!.filename).toBe('mangashelf/example/Series _1_/Ch.2.cbz');
    const files = unzipSync(new Uint8Array(await h.saved[0]!.blob.arrayBuffer()));
    expect(Object.keys(files)).toEqual(['001.png', '002.png', '003.png', 'ComicInfo.xml']);
    expect(files['001.png']).toEqual(PNG);
    const info = strFromU8(files['ComicInfo.xml']!);
    expect(info).toContain('<Series>Series &lt;1&gt;</Series>');
    expect(info).toContain('<PageCount>3</PageCount>');
    expect(info).toContain('<Tags>action, drama</Tags>');
    expect(info).not.toContain('<Manga>');
  });

  it('builds a plain ZIP without ComicInfo.xml', async () => {
    stubFetch();
    const h = hooks();
    await runJob(spec({ format: 'zip' }), h);
    const files = unzipSync(new Uint8Array(await h.saved[0]!.blob.arrayBuffer()));
    expect(Object.keys(files)).toEqual(['001.png', '002.png', '003.png']);
  });

  it('reports failed pages and still saves the rest', async () => {
    stubFetch(['/3.png']);
    const h = hooks();
    const result = await runJob(spec(), h);
    expect(result).toMatchObject({ status: 'done', done: 2, failed: [2] });
    expect(h.saved).toHaveLength(2);
  });

  it('errors when nothing could be downloaded', async () => {
    stubFetch(['cdn.example.com']);
    const h = hooks();
    const result = await runJob(spec({ format: 'cbz' }), h);
    expect(result.status).toBe('error');
    expect(result.error).toBe('No pages downloaded');
    expect(h.saved).toHaveLength(0);
  });
});

describe('comicInfo', () => {
  it('omits unknown fields', () => {
    const xml = comicInfo({ ...gallery, chapter: undefined, tags: undefined }, 1);
    expect(xml).not.toContain('<Number>');
    expect(xml).not.toContain('<Tags>');
    expect(xml).toContain('<Web>https://example.com/read/2</Web>');
  });
});
