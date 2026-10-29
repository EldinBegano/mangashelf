import { runJob } from '@/lib/job-runner';
import { broadcast, listen, send } from '@/lib/messages';

// Chrome only: long-lived page that fetches images and builds archives. It has no
// downloads API, so finished blobs are handed to the background as object URLs.
listen({
  'job:start': ({ spec }) => {
    void runJob(spec, {
      async save(blob, filename) {
        const url = URL.createObjectURL(blob);
        try {
          await send({ type: 'save', url, filename });
        } finally {
          URL.revokeObjectURL(url);
        }
      },
      progress: (progress) => broadcast({ type: 'job:progress', progress }),
    });
  },
});
