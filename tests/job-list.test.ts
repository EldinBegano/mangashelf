import { describe, expect, it } from 'vitest';
import { JobList } from '../lib/job-list';
import type { JobProgress } from '../lib/types';

const job = (id: string, incognito: boolean): JobProgress => ({
  id,
  label: `Series ${id}`,
  total: 1,
  done: 1,
  failed: [],
  status: 'done',
  incognito,
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

  it('forgets private jobs and keeps normal ones', () => {
    const list = new JobList();
    list.record(job('a', false));
    list.record(job('p', true));
    list.forgetPrivate();
    expect(list.list(true)).toEqual([]);
    expect(list.list(false).map((j) => j.id)).toEqual(['a']);
  });
});
