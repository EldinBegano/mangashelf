import { buildArchive, type ArchiveEntry } from './archive';
import { fetchJson, getExtractor } from './extractors';
import { fetchImage } from './fetch-image';
import { chapterLabel } from './naming';
import type { GalleryPage, JobProgress, JobSpec } from './types';

/** Re-resolve page URLs at most this often (MangaDex at-home URLs last about 15 minutes). */
const REFRESH_INTERVAL_MS = 60_000;

export interface JobHooks {
  /** Persist one file under the downloads folder; resolves with its download id once it is written. */
  save(blob: Blob, filename: string): Promise<number | undefined | void>;
  progress(p: JobProgress): void;
}

/** Jobs running in this context, so they can be cancelled. */
const running = new Map<string, AbortController>();

/** Stop a job running in this context; false when it isn't running here. */
export function abortJob(id: string): boolean {
  const controller = running.get(id);
  controller?.abort();
  return !!controller;
}

export function jobLabel(spec: Pick<JobSpec, 'gallery'>): string {
  const ch = chapterLabel(spec.gallery);
  return ch ? `${spec.gallery.series} · ${ch}` : spec.gallery.series;
}

export function initialProgress(spec: JobSpec): JobProgress {
  return {
    id: spec.id,
    label: jobLabel(spec),
    total: spec.pages.length,
    done: 0,
    failed: [],
    status: 'running',
    incognito: spec.incognito,
  };
}

export async function runJob(spec: JobSpec, hooks: JobHooks): Promise<JobProgress> {
  const { gallery } = spec;
  const controller = new AbortController();
  const { signal } = controller;
  running.set(spec.id, controller);
  const progress = initialProgress(spec);
  const save = async (blob: Blob, filename: string) => {
    progress.downloadId = (await hooks.save(blob, filename)) ?? progress.downloadId;
  };
  const report = () => hooks.progress({ ...progress, failed: [...progress.failed] });
  report();

  let pages: GalleryPage[] = gallery.pages;
  let refreshed: Promise<GalleryPage[]> | undefined;
  let refreshedAt = 0;
  const refresh = () => {
    const extractor = getExtractor(gallery.extractor);
    if (!extractor?.refresh) return undefined;
    // Failures share one refresh; a job that outlives the refreshed URLs too gets another.
    if (!refreshed || Date.now() - refreshedAt > REFRESH_INTERVAL_MS) {
      refreshedAt = Date.now();
      refreshed = extractor.refresh(gallery, fetchJson).then((fresh) => (pages = fresh));
    }
    return refreshed;
  };

  const entries: ArchiveEntry[] = [];
  const download = async (slot: number) => {
    const index = spec.pages[slot]!;
    const urlsOf = (p: GalleryPage) => [p.url, ...(p.fallbacks ?? [])];
    let image;
    try {
      image = await fetchImage(urlsOf(pages[index]!), signal);
    } catch (err) {
      if (signal.aborted) throw err;
      const fresh = await refresh()?.catch(() => undefined);
      const page = fresh?.[index];
      if (!page) throw err;
      image = await fetchImage(urlsOf(page), signal);
    }
    const name = `${spec.names[slot]}.${image.ext}`;
    if (spec.format === 'folder') {
      await save(new Blob([image.data], { type: image.type }), `${spec.folder}/${name}`);
    } else {
      entries[slot] = { name, data: image.data };
    }
  };

  let next = 0;
  const worker = async () => {
    while (next < spec.pages.length && !signal.aborted) {
      const slot = next++;
      try {
        await download(slot);
        progress.done++;
      } catch (err) {
        if (signal.aborted) break;
        const index = spec.pages[slot]!;
        console.warn(`[mangashelf] page ${index + 1} failed`, err);
        progress.failed.push(index);
      }
      report();
    }
  };

  try {
    await Promise.all(Array.from({ length: Math.max(1, spec.concurrency) }, worker));
    signal.throwIfAborted();
    if (spec.format !== 'folder') {
      const ok = entries.filter(Boolean);
      if (ok.length === 0) throw new Error('No pages downloaded');
      progress.status = 'packing';
      report();
      const archive = buildArchive(ok, spec.format === 'cbz' ? gallery : undefined);
      signal.throwIfAborted();
      const type = spec.format === 'cbz' ? 'application/vnd.comicbook+zip' : 'application/zip';
      await save(new Blob([archive as Uint8Array<ArrayBuffer>], { type }), `${spec.folder}.${spec.format}`);
    }
    progress.status = progress.done === 0 ? 'error' : 'done';
    if (progress.done === 0) progress.error = 'No pages downloaded';
  } catch (err) {
    progress.status = signal.aborted ? 'cancelled' : 'error';
    if (!signal.aborted) progress.error = err instanceof Error ? err.message : String(err);
  } finally {
    running.delete(spec.id);
  }
  report();
  return progress;
}
