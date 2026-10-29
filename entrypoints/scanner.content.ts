import { defineContentScript } from 'wxt/utils/define-content-script';
import { scanDocument } from '@/lib/extractors';
import type { ScanFn } from '@/lib/messages';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Scroll to the bottom so lazy-loaded reader images get their real src, then scroll back. */
async function scrollThrough(timeoutMs = 30_000): Promise<void> {
  const start = window.scrollY;
  const deadline = Date.now() + timeoutMs;
  let last = -1;
  while (Date.now() < deadline) {
    window.scrollBy(0, window.innerHeight * 0.9);
    await sleep(300);
    const atBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
    if (atBottom && window.scrollY === last) break;
    last = window.scrollY;
  }
  await sleep(500);
  window.scrollTo(0, start);
}

// Injected on demand by the background (scripting.executeScript), never via the manifest.
// Re-injection replaces the function, which keeps working after an extension reload.
export default defineContentScript({
  matches: ['<all_urls>'],
  registration: 'runtime',
  main() {
    const scan: ScanFn = async (options, autoScroll) => {
      try {
        if (autoScroll) await scrollThrough();
        return await scanDocument(location.href, document, options);
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
    };
    (globalThis as unknown as { __mangashelfScan: ScanFn }).__mangashelfScan = scan;
  },
});
