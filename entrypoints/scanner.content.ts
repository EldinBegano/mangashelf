import { defineContentScript } from 'wxt/utils/define-content-script';
import { scrollThrough, windowPage } from '@/lib/auto-scroll';
import { scanDocument } from '@/lib/extractors';
import type { ScanFn } from '@/lib/messages';

// Injected on demand by the background (scripting.executeScript), never via the manifest.
// Re-injection replaces the function, which keeps working after an extension reload.
export default defineContentScript({
  matches: ['<all_urls>'],
  registration: 'runtime',
  main() {
    const scan: ScanFn = async (options, autoScroll) => {
      try {
        if (autoScroll) await scrollThrough(windowPage(window, options.minSize));
        return await scanDocument(location.href, document, options);
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
    };
    (globalThis as unknown as { __mangashelfScan: ScanFn }).__mangashelfScan = scan;
  },
});
