import { abortJob, runJob } from '@/lib/job-runner';
import { broadcast, listen, send } from '@/lib/messages';

// Chrome only: long-lived page that fetches images and builds archives. It has no
// downloads API, so finished blobs are handed to the background as object URLs.
listen({
  'job:start': ({ spec }) => {
    void runJob(spec, {
      async save(blob, filename) {
        const url = URL.createObjectURL(blob);
        try {
          return await send<number | undefined>({ type: 'save', url, filename, incognito: spec.incognito, replace: spec.replace });
        } finally {
          URL.revokeObjectURL(url);
        }
      },
      progress: (progress) => broadcast({ type: 'job:progress', progress }),
    });
  },
  'job:cancel': ({ id }) => abortJob(id),
});
