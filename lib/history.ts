import { chapterLabel } from './naming';
import type { Gallery, JobProgress, JobSpec, SaveFormat } from './types';

/**
 * Download history in IndexedDB. It works in every context the extension has (popup, options,
 * Chrome's service worker and offscreen document, Firefox's background page), so pages read it
 * directly instead of asking the background. Jobs from private windows are never written.
 */

export interface HistoryEntry {
  /** Which chapter this is, so a later download of the same one replaces it. See `chapterKey`. */
  key: string;
  /** Groups chapters of one series: site plus series name. */
  seriesKey: string;
  site: string;
  series: string;
  /** "Vol.1 Ch.2 - Title", or empty. */
  label: string;
  sourceUrl: string;
  format: SaveFormat;
  /** Download-relative folder, or archive path with its extension. */
  path: string;
  /** Pages chosen for the download. */
  total: number;
  /** Indices of pages that still failed after the last attempt. */
  failed: number[];
  /** ms since epoch, of the last attempt. */
  downloadedAt: number;
  /** Last file written, for showing it in its folder; stale once the browser forgets the download. */
  downloadId?: number;
  /** Job that wrote the entry; a retry of the same job updates it in place. */
  jobId: string;
}

const DB_NAME = 'mangashelf';
const DB_VERSION = 1;
const STORE = 'chapters';

let opening: Promise<IDBDatabase> | undefined;

function open(): Promise<IDBDatabase> {
  opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore(STORE, { keyPath: 'key' });
      store.createIndex('seriesKey', 'seriesKey');
      store.createIndex('downloadedAt', 'downloadedAt');
    };
    req.onsuccess = () => {
      const db = req.result;
      // Another context upgrading the schema: step aside and reopen next time.
      db.onversionchange = () => {
        db.close();
        opening = undefined;
      };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('History database is blocked by another tab'));
  }).catch((err) => {
    opening = undefined;
    throw err;
  });
  return opening;
}

const done = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

async function transaction<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => Promise<T> | T): Promise<T> {
  const tx = (await open()).transaction(STORE, mode);
  const finished = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('History transaction aborted'));
  });
  const result = await run(tx.objectStore(STORE));
  await finished;
  return result;
}

/**
 * Identity of a chapter. MangaDex uses the chapter id (its URLs also carry the page number);
 * other sites use the page URL without its fragment and trailing slash.
 */
export function chapterKey(g: Pick<Gallery, 'extractor' | 'sourceUrl' | 'refresh'>): string {
  const chapterId = (g.refresh as { chapterId?: unknown } | undefined)?.chapterId;
  if (g.extractor === 'mangadex' && typeof chapterId === 'string') return `mangadex:${chapterId}`;
  try {
    const url = new URL(g.sourceUrl);
    url.hash = '';
    return url.href.replace(/\/+$/, '');
  } catch {
    return g.sourceUrl;
  }
}

export const seriesKey = (g: Pick<Gallery, 'site' | 'series'>) => `${g.site}\u0000${g.series}`;

/**
 * The entry for a finished job, or undefined when it shouldn't be kept (private, cancelled,
 * nothing saved). `previous` is what is stored under the same chapter: a retry of a folder job
 * only fetches the failed pages, so the page count is taken from the first attempt.
 */
export function historyEntry(spec: JobSpec, p: JobProgress, previous?: HistoryEntry, now = Date.now()): HistoryEntry | undefined {
  if (spec.incognito || p.incognito || p.status !== 'done' || p.done === 0) return undefined;
  const g = spec.gallery;
  const sameJob = previous?.jobId === spec.id;
  return {
    key: chapterKey(g),
    seriesKey: seriesKey(g),
    site: g.site,
    series: g.series,
    label: chapterLabel(g),
    sourceUrl: g.sourceUrl,
    format: spec.format,
    path: spec.format === 'folder' ? spec.folder : `${spec.folder}.${spec.format}`,
    total: sameJob && spec.format === 'folder' ? previous.total : spec.pages.length,
    failed: [...p.failed].sort((a, b) => a - b),
    downloadedAt: now,
    downloadId: p.downloadId ?? (sameJob ? previous.downloadId : undefined),
    jobId: spec.id,
  };
}

export async function getEntry(key: string): Promise<HistoryEntry | undefined> {
  return transaction('readonly', (s) => done(s.get(key) as IDBRequest<HistoryEntry | undefined>));
}

/** Record a finished job. Returns the entry written, if any. */
export async function recordJob(spec: JobSpec, p: JobProgress): Promise<HistoryEntry | undefined> {
  if (spec.incognito || p.status !== 'done') return undefined;
  return transaction('readwrite', async (s) => {
    const previous = (await done(s.get(chapterKey(spec.gallery)))) as HistoryEntry | undefined;
    const entry = historyEntry(spec, p, previous);
    if (entry) s.put(entry);
    return entry;
  });
}

/** Newest first. */
export async function listHistory(): Promise<HistoryEntry[]> {
  const all = await transaction('readonly', (s) => done(s.index('downloadedAt').getAll() as IDBRequest<HistoryEntry[]>));
  return all.reverse();
}

export async function deleteEntries(keys: string[]): Promise<void> {
  await transaction('readwrite', (s) => {
    for (const key of keys) s.delete(key);
  });
}

export async function clearHistory(): Promise<void> {
  await transaction('readwrite', (s) => void s.clear());
}

export interface HistoryExport {
  app: 'mangashelf';
  kind: 'history';
  version: 1;
  exportedAt: string;
  entries: HistoryEntry[];
}

export async function exportHistory(): Promise<HistoryExport> {
  return { app: 'mangashelf', kind: 'history', version: 1, exportedAt: new Date().toISOString(), entries: await listHistory() };
}

const isEntry = (e: unknown): e is HistoryEntry => {
  const x = e as Partial<HistoryEntry> | null;
  return (
    typeof x?.key === 'string' &&
    typeof x.seriesKey === 'string' &&
    typeof x.series === 'string' &&
    typeof x.downloadedAt === 'number' &&
    typeof x.total === 'number' &&
    Array.isArray(x.failed)
  );
};

/**
 * Merge an export into the history; the newer entry wins for a chapter present in both.
 * Returns how many entries were added or updated.
 */
export async function importHistory(data: unknown): Promise<number> {
  const file = data as Partial<HistoryExport> | null;
  if (file?.app !== 'mangashelf' || file.kind !== 'history' || !Array.isArray(file.entries)) {
    throw new Error('Not a mangashelf history export');
  }
  if (file.version !== 1) throw new Error(`Unsupported history export version ${String(file.version)}`);
  const entries = file.entries.filter(isEntry);
  return transaction('readwrite', async (s) => {
    let changed = 0;
    for (const entry of entries) {
      const current = (await done(s.get(entry.key))) as HistoryEntry | undefined;
      if (current && current.downloadedAt >= entry.downloadedAt) continue;
      // An imported download id belongs to another browser's download list.
      s.put({ ...entry, downloadId: undefined });
      changed++;
    }
    return changed;
  });
}

export interface SeriesGroup {
  seriesKey: string;
  site: string;
  series: string;
  /** Newest first. */
  chapters: HistoryEntry[];
}

/**
 * Entries grouped by series, the series downloaded from most recently first. A query keeps
 * chapters whose series, site or label contains every word of it, ignoring case.
 */
export function groupBySeries(entries: HistoryEntry[], query = ''): SeriesGroup[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const groups = new Map<string, SeriesGroup>();
  const sorted = [...entries].sort((a, b) => b.downloadedAt - a.downloadedAt);
  for (const e of sorted) {
    const text = `${e.series} ${e.site} ${e.label}`.toLowerCase();
    if (!words.every((w) => text.includes(w))) continue;
    let group = groups.get(e.seriesKey);
    if (!group) groups.set(e.seriesKey, (group = { seriesKey: e.seriesKey, site: e.site, series: e.series, chapters: [] }));
    group.chapters.push(e);
  }
  return [...groups.values()];
}
