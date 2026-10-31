import { browser, type Browser } from 'wxt/browser';
import { downloadAndWait } from './downloads';
import { canRetry, isActive as active, JobList, retrySpec } from './job-list';
import { abortJob, initialProgress, runJob } from './job-runner';
import { broadcast, send } from './messages';
import { ensureRefererRules } from './referer-rules';
import { getSettings } from './settings';
import type { JobProgress, JobSpec } from './types';

const jobs = new JobList();
let restoring: Promise<void> | undefined;

/** Load what a previous service worker stored, before anything is recorded over it. */
function restore(): Promise<void> {
  restoring ??= (async () => {
    const stored = await browser.storage.session?.get(['jobs', 'specs']).catch(() => undefined);
    jobs.restore((stored?.jobs as JobProgress[] | undefined) ?? [], (stored?.specs as JobSpec[] | undefined) ?? []);
  })();
  return restoring;
}

/** Normal-window jobs are mirrored to session storage so a restarted service worker still knows them. */
export async function recordProgress(p: JobProgress): Promise<void> {
  await restore();
  const before = jobs.get(p.id)?.status;
  jobs.record(p);
  browser.storage.session?.set({ jobs: jobs.persistable() }).catch(() => {});
  if (!active(p.status) && (before === undefined || active(before))) ended(p);
  if (!active(p.status)) closeOffscreenWhenIdle();
  updateBadge();
}

export async function listJobs(incognito: boolean): Promise<JobProgress[]> {
  await restore();
  if (!incognito) {
    // The user is looking at the list now.
    needsAttention = false;
    updateBadge();
  }
  return jobs.list(incognito);
}

/** Called once no private window is left open. */
export function forgetPrivateJobs(): void {
  jobs.forgetPrivate();
}

// Toolbar badge: overall progress of running jobs, or "!" after a job had failures,
// until the popup is opened. Private jobs stay out of it, since the badge shows in every window.
let needsAttention = false;
let badgeText: string | undefined;

function updateBadge(): void {
  const running = jobs.persistable().filter((j) => active(j.status));
  let text = needsAttention ? '!' : '';
  if (running.length) {
    const total = running.reduce((n, j) => n + j.total, 0);
    const done = running.reduce((n, j) => n + j.done + j.failed.length, 0);
    text = `${Math.floor((done / total) * 100)}%`;
  }
  if (text === badgeText) return;
  badgeText = text;
  const action = browser.action ?? browser.browserAction;
  action.setBadgeText({ text }).catch(() => {});
  if (text) action.setBadgeBackgroundColor({ color: text === '!' ? '#e03131' : '#d6336c' }).catch(() => {});
}

function ended(p: JobProgress): void {
  if (p.incognito || p.status === 'cancelled') return;
  if (p.status === 'error' || p.failed.length) needsAttention = true;
  notifyEnded(p).catch((err) => console.warn('[mangashelf] notification failed', err));
}

let clicksHandled = false;

/**
 * Clicking a notification shows the file in its folder. Call at startup so a stopped
 * service worker is woken for the click; notifyEnded also calls it in case the
 * permission was granted after startup.
 */
export function handleNotificationClicks(): void {
  if (clicksHandled || !browser.notifications) return;
  clicksHandled = true;
  browser.notifications.onClicked.addListener(async (id) => {
    await restore();
    const downloadId = jobs.get(id)?.downloadId;
    if (downloadId !== undefined) browser.downloads.show(downloadId);
    browser.notifications.clear(id);
  });
}

async function notifyEnded(p: JobProgress): Promise<void> {
  if (!(await getSettings()).notify) return;
  // Optional permission, granted from the settings page.
  if (!browser.notifications || !(await browser.permissions.contains({ permissions: ['notifications'] }))) return;
  handleNotificationClicks();
  const failed = p.failed.length;
  await browser.notifications.create(p.id, {
    type: 'basic',
    iconUrl: browser.runtime.getURL('/icon/128.png'),
    title:
      p.status === 'error'
        ? 'Download failed'
        : failed
          ? `Downloaded, ${failed} page${failed === 1 ? '' : 's'} failed`
          : 'Download finished',
    message: p.status === 'error' ? `${p.label}: ${p.error ?? 'unknown error'}` : p.label,
  });
}

/** Chrome closes the offscreen document this long after the last job ends. */
const OFFSCREEN_IDLE_MS = 10_000;

let creatingOffscreen: Promise<void> | undefined;
let closingOffscreen: Promise<void> | undefined;
let idleTimer: ReturnType<typeof setTimeout> | undefined;

async function ensureOffscreen(): Promise<void> {
  clearTimeout(idleTimer);
  await closingOffscreen;
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

/**
 * The offscreen document only exists to run jobs, so close it once none is left. The short
 * wait spares reopening it when one download follows another.
 */
function closeOffscreenWhenIdle(): void {
  if (import.meta.env.FIREFOX) return;
  clearTimeout(idleTimer);
  if (jobs.hasActive()) return;
  idleTimer = setTimeout(() => {
    if (jobs.hasActive() || creatingOffscreen || closingOffscreen) return;
    closingOffscreen = browser.offscreen
      .closeDocument()
      .catch(() => {}) // already closed
      .finally(() => (closingOffscreen = undefined));
  }, OFFSCREEN_IDLE_MS);
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
  await restore();
  jobs.remember(spec);
  await recordProgress(initialProgress(spec));
  browser.storage.session?.set({ specs: jobs.persistableSpecs() }).catch(() => {});
  if (import.meta.env.FIREFOX) {
    void runJob(spec, {
      async save(blob, filename) {
        const url = URL.createObjectURL(blob);
        try {
          return await downloadAndWait(url, filename, spec.incognito, spec.replace);
        } finally {
          URL.revokeObjectURL(url);
        }
      },
      progress(p) {
        void recordProgress(p);
        broadcast({ type: 'job:progress', progress: p });
      },
    });
    return;
  }
  await ensureOffscreen();
  await sendWithRetry(spec);
}

export async function cancelJob(id: string): Promise<void> {
  const stopped = import.meta.env.FIREFOX ? abortJob(id) : await send<boolean>({ type: 'job:cancel', id }).catch(() => false);
  if (stopped) return;
  // Nothing runs it any more (e.g. the offscreen document is gone), so only the list is out of date.
  await restore();
  const p = jobs.get(id);
  if (p && active(p.status)) await recordProgress({ ...p, status: 'cancelled' });
}

export async function retryJob(id: string): Promise<void> {
  await restore();
  const p = jobs.get(id);
  if (!p || !canRetry(p)) return;
  const spec = jobs.spec(id);
  if (!spec) throw new Error('This download can no longer be retried. Start it again from the page.');
  const next = retrySpec(spec, p);
  // Mark it running right away so a second click does nothing.
  jobs.record(initialProgress(next));
  await ensureRefererRules(next.gallery);
  await startJob(next);
}
