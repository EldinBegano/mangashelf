import { describe, expect, it } from 'vitest';
import { canRetry, JobList, retrySpec } from '../lib/job-list';
import type { JobProgress, JobSpec } from '../lib/types';

const job = (id: string, incognito: boolean): JobProgress => ({
  id,
  label: `Series ${id}`,
  total: 1,
  done: 1,
  failed: [],
  status: 'done',
  incognito,
});

const jobSpec = (id: string, patch: Partial<JobSpec> = {}): JobSpec => ({
  id,
  gallery: { extractor: 'generic', site: 'example', series: 'S', sourceUrl: 'https://example.com', pages: [] },
  pages: [1, 3, 4],
  format: 'folder',
  folder: 'mangashelf/example/S',
  names: ['002', '004', '005'],
  concurrency: 3,
  incognito: false,
  ...patch,
});

describe('JobList', () => {
  it('lists only jobs from the same kind of window, newest first', () => {
    const list = new JobList();
    list.record(job('a', false));
    list.record(job('p', true));
    list.record(job('b', false));
    expect(list.list(false).map((j) => j.id)).toEqual(['b', 'a']);
    expect(list.list(true).map((j) => j.id)).toEqual(['p']);
  });

  it('never hands private jobs out for storage', () => {
    const list = new JobList();
    list.record(job('a', false));
    list.record(job('p', true));
    expect(list.persistable().map((j) => j.id)).toEqual(['a']);
  });

  it('ignores private jobs when restoring from storage', () => {
    const list = new JobList();
    list.restore([job('a', false), job('p', true)]);
    expect(list.list(true)).toEqual([]);
    expect(list.list(false).map((j) => j.id)).toEqual(['a']);
  });

  it('keeps specs for retries, drops them with their job, and never stores private ones', () => {
    const list = new JobList();
    list.remember(jobSpec('a'));
    list.record(job('a', false));
    list.remember(jobSpec('p', { incognito: true }));
    list.record(job('p', true));
    expect(list.spec('p')?.id).toBe('p');
    expect(list.persistableSpecs().map((s) => s.id)).toEqual(['a']);
    for (let i = 0; i < 20; i++) list.record(job(`n${i}`, false));
    expect(list.spec('a')).toBeUndefined();
  });

  it('restores specs only for restored jobs', () => {
    const list = new JobList();
    list.restore([job('a', false)], [jobSpec('a'), jobSpec('gone')]);
    expect(list.spec('a')?.id).toBe('a');
    expect(list.spec('gone')).toBeUndefined();
  });

  it('forgets private jobs and keeps normal ones', () => {
    const list = new JobList();
    list.record(job('a', false));
    list.record(job('p', true));
    list.forgetPrivate();
    expect(list.list(true)).toEqual([]);
    expect(list.list(false).map((j) => j.id)).toEqual(['a']);
  });
});

describe('retry', () => {
  it('is offered for failed jobs and finished jobs with failed pages', () => {
    expect(canRetry({ ...job('a', false), failed: [2] })).toBe(true);
    expect(canRetry({ ...job('a', false), status: 'error' })).toBe(true);
    expect(canRetry(job('a', false))).toBe(false);
    expect(canRetry({ ...job('a', false), status: 'running', failed: [2] })).toBe(false);
    expect(canRetry({ ...job('a', false), status: 'cancelled' })).toBe(false);
  });

  it('downloads only the failed pages of a folder, with their original names', () => {
    const next = retrySpec(jobSpec('a'), { ...job('a', false), failed: [4, 1] });
    expect(next).toMatchObject({ pages: [1, 4], names: ['002', '005'] });
    expect(next.replace).toBeUndefined();
  });

  it('rebuilds a whole archive and replaces the partial one', () => {
    const next = retrySpec(jobSpec('a', { format: 'cbz' }), { ...job('a', false), failed: [4] });
    expect(next).toMatchObject({ pages: [1, 3, 4], names: ['002', '004', '005'], replace: true });
  });
});
