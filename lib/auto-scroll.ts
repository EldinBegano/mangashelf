/** Pause after each scroll step; lazy loaders that debounce scroll events need a moment to react. */
const STEP_MS = 300;
/** Stop once the large images have stayed the same this long. */
const SETTLE_MS = 1000;

/** What the auto-scroller needs from a page; `windowPage` is the real one, tests use a fake. */
export interface ScrollPage {
  offset(): number;
  scrollTo(y: number): void;
  /** Visible height. */
  viewport(): number;
  images(): {
    /** Changes whenever a large image is added, gets a new source or finishes loading. */
    state: string;
    /** Lowest bottom edge of a large image, in px from the top of the viewport (0 when there is none). */
    lastBottom: number;
  };
}

export interface ScrollTiming {
  timeoutMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Scroll down so lazy-loaded images get their real source, then scroll back. Stops once the
 * last large image is in view, or the page can't scroll further, and nothing new has shown
 * up for a second: what follows the reader (comments, endless recommendation feeds) has no
 * pages to load, so there is no need to reach a bottom that never comes.
 */
export async function scrollThrough(
  page: ScrollPage,
  { timeoutMs = 30_000, now = Date.now, sleep = wait }: ScrollTiming = {},
): Promise<void> {
  const start = page.offset();
  const deadline = now() + timeoutMs;
  let state: string | undefined;
  let changedAt = now();
  while (now() < deadline) {
    const before = page.offset();
    page.scrollTo(before + page.viewport() * 0.9);
    await sleep(STEP_MS);
    const images = page.images();
    if (images.state !== state) {
      state = images.state;
      changedAt = now();
    }
    const done = images.lastBottom <= page.viewport() || page.offset() === before;
    if (done && now() - changedAt >= SETTLE_MS) break;
  }
  await sleep(500);
  page.scrollTo(start);
}

/**
 * The page in a window. "Large" uses the rendered size against the scan's minimum size, so
 * small thumbnails (recommendation grids) don't keep the scroll going. Lazy placeholders are
 * usually sized like the page they stand for, so they count before they load.
 */
export function windowPage(win: Window, minSize: number): ScrollPage {
  const min = Math.max(1, minSize);
  return {
    offset: () => win.scrollY,
    scrollTo: (y) => win.scrollTo(0, y),
    viewport: () => win.innerHeight,
    images() {
      let count = 0;
      let loaded = 0;
      let sources = 0;
      let lastBottom = 0;
      for (const img of win.document.images) {
        const box = img.getBoundingClientRect();
        if (box.width < min || box.height < min) continue;
        count++;
        if (img.complete && img.naturalWidth > 0) loaded++;
        sources += img.currentSrc.length;
        lastBottom = Math.max(lastBottom, box.bottom);
      }
      return { state: `${count}:${loaded}:${sources}`, lastBottom };
    },
  };
}
