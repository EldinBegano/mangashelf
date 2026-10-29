import type { JobProgress, JobSpec } from './types';

const MAX_JOBS = 20;

/**
 * Latest progress per job, plus the spec it ran with (for retries). Jobs started from a
 * private window are kept apart: they are only listed for private windows and never
 * handed out for storage.
 */
export class JobList {
  private jobs = new Map<string, JobProgress>();
  private specs = new Map<string, JobSpec>();

  record(p: JobProgress): void {
    this.jobs.set(p.id, p);
    while (this.jobs.size > MAX_JOBS) {
      const oldest = this.jobs.keys().next().value!;
      this.jobs.delete(oldest);
      this.specs.delete(oldest);
    }
  }

  get(id: string): JobProgress | undefined {
    return this.jobs.get(id);
  }

  remember(spec: JobSpec): void {
    this.specs.set(spec.id, spec);
  }

  spec(id: string): JobSpec | undefined {
    return this.specs.get(id);
  }

  /** Newest first, only jobs from the same kind of window. */
  list(incognito: boolean): JobProgress[] {
    return [...this.jobs.values()].filter((j) => j.incognito === incognito).reverse();
  }

  /** What may be written to storage: normal-window jobs only. */
  persistable(): JobProgress[] {
    return [...this.jobs.values()].filter((j) => !j.incognito);
  }

  persistableSpecs(): JobSpec[] {
    return [...this.specs.values()].filter((s) => !s.incognito && this.jobs.has(s.id));
  }

  restore(saved: JobProgress[], specs: JobSpec[] = []): void {
    for (const p of saved) if (!p.incognito && !this.jobs.has(p.id)) this.jobs.set(p.id, p);
    for (const s of specs) if (!s.incognito && this.jobs.has(s.id) && !this.specs.has(s.id)) this.specs.set(s.id, s);
  }

  forgetPrivate(): void {
    for (const [id, job] of this.jobs) {
      if (!job.incognito) continue;
      this.jobs.delete(id);
      this.specs.delete(id);
    }
  }
}

/** A job that ended with failed pages, or failed outright, can be retried. */
export function canRetry(p: JobProgress): boolean {
  return p.status === 'error' || (p.status === 'done' && p.failed.length > 0);
}

/** The job to run for a retry: just the failed pages of a folder; a whole new archive for ZIP/CBZ. */
export function retrySpec(spec: JobSpec, p: JobProgress): JobSpec {
  // An archive can't be patched, so it is rebuilt and replaces the partial one.
  if (spec.format !== 'folder') return { ...spec, replace: true };
  const pages = p.failed.length ? [...p.failed].sort((a, b) => a - b) : spec.pages;
  return { ...spec, pages, names: pages.map((i) => spec.names[spec.pages.indexOf(i)]!) };
}
