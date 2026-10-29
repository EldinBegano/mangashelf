import { buildArchive, type ArchiveEntry } from './archive';
import { fetchJson, getExtractor } from './extractors';
import { fetchImage } from './fetch-image';
import { chapterLabel } from './naming';
import type { GalleryPage, JobProgress, JobSpec } from './types';

export interface JobHooks {
  /** Persist one file under the downloads folder; resolves when it is written. */
  save(blob: Blob, filename: string): Promise<void>;
  progress(p: JobProgress): void;
}

export function jobLabel(spec: Pick<JobSpec, 'gallery'>): string {
  const ch = chapterLabel(spec.gallery);
  return ch ? `${spec.gallery.series} · ${ch}` : spec.gallery.series;
}

export async function runJob(spec: JobSpec, hooks: JobHooks): Promise<JobProgress> {
  const { gallery } = spec;
  const progress: JobProgress = {
    id: spec.id,
    label: jobLabel(spec),
    total: spec.pages.length,
    done: 0,
    failed: [],
    status: 'running',
    incognito: spec.incognito,
  };
  const report = () => hooks.progress({ ...progress, failed: [...progress.failed] });
  report();

  let pages: GalleryPage[] = gallery.pages;
  let refreshed: Promise<GalleryPage[]> | undefined;
  const refresh = () => {
    const extractor = getExtractor(gallery.extractor);
    if (!extractor?.refresh) return undefined;
    refreshed ??= extractor.refresh(gallery, fetchJson).then((fresh) => (pages = fresh));
    return refreshed;
  };

  const entries: ArchiveEntry[] = [];
  const download = async (slot: number) => {
    const index = spec.pages[slot]!;
    const urlsOf = (p: GalleryPage) => [p.url, ...(p.fallbacks ?? [])];
    let image;
    try {
      image = await fetchImage(urlsOf(pages[index]!));
    } catch (err) {
      const fresh = await refresh()?.catch(() => undefined);
      const page = fresh?.[index];
      if (!page) throw err;
      image = await fetchImage(urlsOf(page));
    }
    const name = `${spec.names[slot]}.${image.ext}`;
    if (spec.format === 'folder') {
      await hooks.save(new Blob([image.data], { type: image.type }), `${spec.folder}/${name}`);
    } else {
      entries[slot] = { name, data: image.data };
    }
  };

  let next = 0;
  const worker = async () => {
    while (next < spec.pages.length) {
      const slot = next++;
      try {
        await download(slot);
        progress.done++;
      } catch (err) {
        const index = spec.pages[slot]!;
        console.warn(`[mangashelf] page ${index + 1} failed`, err);
        progress.failed.push(index);
      }
      report();
    }
  };

  try {
    await Promise.all(Array.from({ length: Math.max(1, spec.concurrency) }, worker));
    if (spec.format !== 'folder') {
      const ok = entries.filter(Boolean);
      if (ok.length === 0) throw new Error('No pages downloaded');
      progress.status = 'packing';
      report();
      const archive = buildArchive(ok, spec.format === 'cbz' ? gallery : undefined);
      const type = spec.format === 'cbz' ? 'application/vnd.comicbook+zip' : 'application/zip';
      await hooks.save(new Blob([archive as Uint8Array<ArrayBuffer>], { type }), `${spec.folder}.${spec.format}`);
    }
    progress.status = progress.done === 0 ? 'error' : 'done';
    if (progress.done === 0) progress.error = 'No pages downloaded';
  } catch (err) {
    progress.status = 'error';
    progress.error = err instanceof Error ? err.message : String(err);
  }
  report();
  return progress;
}
