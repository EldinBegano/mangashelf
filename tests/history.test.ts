import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  chapterKey,
  clearHistory,
  deleteEntries,
  exportHistory,
  getEntry,
  groupBySeries,
  historyEntry,
  importHistory,
  listHistory,
  recordJob,
  type HistoryEntry,
} from '../lib/history';
import type { Gallery, JobProgress, JobSpec } from '../lib/types';

const gallery: Gallery = {
  extractor: 'generic',
  site: 'example',
  series: 'Series',
  chapter: '2',
  sourceUrl: 'https://example.com/read/2/#page-3',
  pages: [{ url: 'a' }, { url: 'b' }, { url: 'c' }],
};

function spec(patch: Partial<JobSpec> = {}): JobSpec {
  return {
    id: 'job',
    gallery,
    pages: [0, 1, 2],
    format: 'cbz',
    folder: 'mangashelf/example/Series/Ch.2',
    names: ['001', '002', '003'],
    concurrency: 2,
    incognito: false,
    ...patch,
  };
}

function progress(patch: Partial<JobProgress> = {}): JobProgress {
  return { id: 'job', label: 'Series · Ch.2', total: 3, done: 3, failed: [], status: 'done', incognito: false, ...patch };
}

beforeEach(() => clearHistory());

describe('chapterKey', () => {
  it('uses the MangaDex chapter id, whatever page the URL is on', () => {
    const md = { extractor: 'mangadex', sourceUrl: 'https://mangadex.org/chapter/abc/4', refresh: { chapterId: 'abc' } };
    expect(chapterKey(md)).toBe('mangadex:abc');
  });

  it('drops the fragment and trailing slash of other URLs, keeping the query', () => {
    expect(chapterKey(gallery)).toBe('https://example.com/read/2');
    expect(chapterKey({ ...gallery, sourceUrl: 'https://example.com/read?ch=2#x' })).toBe('https://example.com/read?ch=2');
  });
});

describe('historyEntry', () => {
  it('keeps nothing for private, cancelled, failed or empty jobs', () => {
    expect(historyEntry(spec({ incognito: true }), progress({ incognito: true }))).toBeUndefined();
    expect(historyEntry(spec(), progress({ status: 'cancelled' }))).toBeUndefined();
    expect(historyEntry(spec(), progress({ status: 'error' }))).toBeUndefined();
    expect(historyEntry(spec(), progress({ done: 0, failed: [0, 1, 2] }))).toBeUndefined();
  });

  it('describes the saved file', () => {
    const e = historyEntry(spec(), progress({ done: 2, failed: [2], downloadId: 7 }), undefined, 1000)!;
    expect(e).toMatchObject({
      key: 'https://example.com/read/2',
      series: 'Series',
      label: 'Ch.2',
      path: 'mangashelf/example/Series/Ch.2.cbz',
      total: 3,
      failed: [2],
      downloadedAt: 1000,
      downloadId: 7,
    });
  });

  it('keeps the first attempt’s page count when a folder retry fetched only the failed pages', () => {
    const first = historyEntry(spec({ format: 'folder' }), progress({ done: 1, failed: [1, 2], downloadId: 4 }))!;
    const retry = historyEntry(spec({ format: 'folder', pages: [1, 2] }), progress({ total: 2, done: 1, failed: [2] }), first)!;
    expect(retry).toMatchObject({ total: 3, failed: [2], path: 'mangashelf/example/Series/Ch.2', downloadId: 4 });
  });

  it('takes the new page count when the chapter is downloaded again by another job', () => {
    const first = historyEntry(spec({ format: 'folder' }), progress())!;
    const again = historyEntry(spec({ id: 'other', format: 'folder', pages: [0] }), progress({ id: 'other', total: 1, done: 1 }), first)!;
    expect(again).toMatchObject({ total: 1, jobId: 'other', downloadId: undefined });
  });
});

describe('IndexedDB store', () => {
  it('records, reads, lists newest first and deletes', async () => {
    await recordJob(spec(), progress());
    const other = { ...gallery, chapter: '3', sourceUrl: 'https://example.com/read/3' };
    await new Promise((r) => setTimeout(r, 5));
    await recordJob(spec({ id: 'job2', gallery: other }), progress({ id: 'job2' }));
    expect((await listHistory()).map((e) => e.label)).toEqual(['Ch.3', 'Ch.2']);
    expect((await getEntry('https://example.com/read/2'))?.format).toBe('cbz');
    await deleteEntries(['https://example.com/read/3']);
    expect((await listHistory()).map((e) => e.label)).toEqual(['Ch.2']);
  });

  it('replaces the entry when a chapter is downloaded again', async () => {
    await recordJob(spec({ format: 'zip' }), progress());
    await recordJob(spec({ id: 'job2', format: 'cbz' }), progress({ id: 'job2' }));
    const all = await listHistory();
    expect(all).toHaveLength(1);
    expect(all[0]!.format).toBe('cbz');
  });

  it('never writes private jobs', async () => {
    expect(await recordJob(spec({ incognito: true }), progress({ incognito: true }))).toBeUndefined();
    expect(await listHistory()).toEqual([]);
  });

  it('round-trips an export, newer entries winning and download ids dropped', async () => {
    await recordJob(spec(), progress({ downloadId: 9 }));
    const data = JSON.parse(JSON.stringify(await exportHistory()));
    expect(data).toMatchObject({ app: 'mangashelf', kind: 'history', version: 1 });
    await clearHistory();
    expect(await importHistory(data)).toBe(1);
    expect((await listHistory())[0]).toMatchObject({ label: 'Ch.2', downloadId: undefined });
    // Importing the same file again changes nothing.
    expect(await importHistory(data)).toBe(0);
  });

  it('rejects files that are not a history export and skips malformed entries', async () => {
    await expect(importHistory({ settings: {} })).rejects.toThrow('Not a mangashelf history export');
    await expect(importHistory({ app: 'mangashelf', kind: 'history', version: 2, entries: [] })).rejects.toThrow('version 2');
    const good = historyEntry(spec(), progress())!;
    expect(await importHistory({ app: 'mangashelf', kind: 'history', version: 1, entries: [good, { key: 1 }, null] })).toBe(1);
  });
});

describe('groupBySeries', () => {
  const entry = (series: string, label: string, downloadedAt: number): HistoryEntry => ({
    ...historyEntry(spec(), progress())!,
    key: `${series}/${label}`,
    seriesKey: `example\u0000${series}`,
    series,
    label,
    downloadedAt,
  });
  const entries = [entry('Alpha', 'Ch.1', 1), entry('Beta', 'Ch.1', 2), entry('Alpha', 'Ch.2', 3)];

  it('orders series and chapters by the latest download', () => {
    const groups = groupBySeries(entries);
    expect(groups.map((g) => g.series)).toEqual(['Alpha', 'Beta']);
    expect(groups[0]!.chapters.map((c) => c.label)).toEqual(['Ch.2', 'Ch.1']);
  });

  it('filters on every word, ignoring case', () => {
    expect(groupBySeries(entries, 'alpha ch.1').flatMap((g) => g.chapters.map((c) => c.key))).toEqual(['Alpha/Ch.1']);
    expect(groupBySeries(entries, 'EXAMPLE')).toHaveLength(2);
    expect(groupBySeries(entries, 'gamma')).toEqual([]);
  });
});
