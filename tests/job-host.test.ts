import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JobProgress, JobSpec } from '../lib/types';

// Chrome build: jobs run in an offscreen document.
let open = false;
const offscreen = {
  createDocument: vi.fn(async () => {
    open = true;
  }),
  closeDocument: vi.fn(async () => {
    if (!open) throw new Error('No current offscreen document.');
    open = false;
  }),
};
const browserMock = {
  offscreen,
  runtime: {
    getContexts: async () => (open ? [{ contextType: 'OFFSCREEN_DOCUMENT' }] : []),
    sendMessage: async () => ({ ok: true, value: undefined }),
    getURL: (path: string) => path,
  },
  storage: {
    local: { get: async () => ({}) },
    session: { get: async () => ({}), set: async () => {} },
  },
  action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
  permissions: { contains: async () => false },
};
vi.mock('wxt/browser', () => ({ browser: browserMock }));

const { initialProgress } = await import('../lib/job-runner');
let host: typeof import('../lib/job-host');

let nextId = 0;
const spec = (): JobSpec => ({
  id: `job-${++nextId}`,
  gallery: { extractor: 'generic', site: 'example', series: 'x', sourceUrl: 'https://example.com', pages: [{ url: 'https://example.com/1.jpg' }] },
  pages: [0],
  format: 'folder',
  folder: 'mangashelf/example/x',
  names: ['001'],
  concurrency: 1,
  incognito: false,
});
const finished = (s: JobSpec): JobProgress => ({ ...initialProgress(s), done: 1, status: 'done' });

beforeEach(async () => {
  // A fresh job list for every test.
  vi.resetModules();
  host = await import('../lib/job-host');
  vi.useFakeTimers();
  open = false;
  offscreen.createDocument.mockClear();
  offscreen.closeDocument.mockClear();
});
afterEach(() => vi.useRealTimers());

describe('offscreen document', () => {
  it('closes a while after the last job ends', async () => {
    const a = spec();
    await host.startJob(a);
    expect(open).toBe(true);
    await host.recordProgress(finished(a));
    await vi.advanceTimersByTimeAsync(9_000);
    expect(offscreen.closeDocument).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(open).toBe(false);
  });

  it('stays open while another job runs, or one starts during the wait', async () => {
    const [a, b, c] = [spec(), spec(), spec()];
    await host.startJob(a);
    await host.startJob(b);
    await host.recordProgress(finished(a));
    await vi.advanceTimersByTimeAsync(20_000);
    expect(offscreen.closeDocument).not.toHaveBeenCalled();

    await host.recordProgress(finished(b));
    await vi.advanceTimersByTimeAsync(5_000);
    await host.startJob(c);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(offscreen.closeDocument).not.toHaveBeenCalled();
    expect(offscreen.createDocument).toHaveBeenCalledTimes(1);
  });

  it('opens again for a job started after it closed', async () => {
    const [a, b] = [spec(), spec()];
    await host.startJob(a);
    await host.recordProgress(finished(a));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(open).toBe(false);
    await host.startJob(b);
    expect(open).toBe(true);
    expect(offscreen.createDocument).toHaveBeenCalledTimes(2);
  });
});
