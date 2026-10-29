import { browser, type Browser } from 'wxt/browser';
import { downloadAndWait } from './downloads';
import { JobList } from './job-list';
import { runJob } from './job-runner';
import { broadcast, send } from './messages';
import type { JobProgress, JobSpec } from './types';

const jobs = new JobList();
let restored = false;

/** Normal-window jobs are mirrored to session storage so a restarted service worker still knows them. */
export function recordProgress(p: JobProgress): void {
  jobs.record(p);
  browser.storage.session?.set({ jobs: jobs.persistable() }).catch(() => {});
}

export async function listJobs(incognito: boolean): Promise<JobProgress[]> {
  if (!restored) {
    restored = true;
    const stored = await browser.storage.session?.get('jobs').catch(() => undefined);
    jobs.restore((stored?.jobs as JobProgress[] | undefined) ?? []);
  }
  return jobs.list(incognito);
}

/** Called once no private window is left open. */
export function forgetPrivateJobs(): void {
  jobs.forgetPrivate();
}

let creatingOffscreen: Promise<void> | undefined;

async function ensureOffscreen(): Promise<void> {
  const contexts = await browser.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT' as Browser.runtime.ContextType] });
  if (contexts.length > 0) return;
  creatingOffscreen ??= browser.offscreen
    .createDocument({
      url: 'offscreen.html',
      reasons: ['BLOBS' as Browser.offscreen.Reason],
      justification: 'Fetch images and build ZIP/CBZ archives for downloads',
    })
    .finally(() => (creatingOffscreen = undefined));
  await creatingOffscreen;
}

async function sendWithRetry(spec: JobSpec): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await send({ type: 'job:start', spec });
      return;
    } catch (err) {
      // The offscreen document may not have registered its listener yet.
      if (attempt >= 20) throw err;
      await new Promise((r) => setTimeout(r, 100));
    }
  }
}

/**
 * Chrome: the service worker can be stopped mid-job, so jobs run in an offscreen document.
 * Firefox: the persistent MV2 background page runs them directly.
 */
export async function startJob(spec: JobSpec): Promise<void> {
  if (import.meta.env.FIREFOX) {
    void runJob(spec, {
      async save(blob, filename) {
        const url = URL.createObjectURL(blob);
        try {
          await downloadAndWait(url, filename, spec.incognito);
        } finally {
          URL.revokeObjectURL(url);
        }
      },
      progress(p) {
        recordProgress(p);
        broadcast({ type: 'job:progress', progress: p });
      },
    });
    return;
  }
  await ensureOffscreen();
  await sendWithRetry(spec);
}
