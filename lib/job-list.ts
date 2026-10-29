import type { JobProgress } from './types';

const MAX_JOBS = 20;

/**
 * Latest progress per job. Jobs started from a private window are kept apart:
 * they are only listed for private windows and never handed out for storage.
 */
export class JobList {
  private jobs = new Map<string, JobProgress>();

  record(p: JobProgress): void {
    this.jobs.set(p.id, p);
    while (this.jobs.size > MAX_JOBS) this.jobs.delete(this.jobs.keys().next().value!);
  }

  /** Newest first, only jobs from the same kind of window. */
  list(incognito: boolean): JobProgress[] {
    return [...this.jobs.values()].filter((j) => j.incognito === incognito).reverse();
  }

  /** What may be written to storage: normal-window jobs only. */
  persistable(): JobProgress[] {
    return [...this.jobs.values()].filter((j) => !j.incognito);
  }

  restore(saved: JobProgress[]): void {
    for (const p of saved) if (!p.incognito && !this.jobs.has(p.id)) this.jobs.set(p.id, p);
  }

  forgetPrivate(): void {
    for (const [id, job] of this.jobs) if (job.incognito) this.jobs.delete(id);
  }
}
