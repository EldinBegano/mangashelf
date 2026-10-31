import { describe, expect, it } from 'vitest';
import { scrollThrough, type ScrollPage } from '../lib/auto-scroll';

const VIEW = 800;

/**
 * A fake page on a fake clock. `height` and `images` (bottom edges in page px) may grow over
 * time; every image counts as loaded, so the image state is just their number.
 */
function fakePage(spec: { height: (t: number) => number; images: (t: number) => number[] }) {
  let t = 0;
  let y = 0;
  let deepest = 0;
  const page: ScrollPage = {
    offset: () => y,
    scrollTo(to) {
      y = Math.max(0, Math.min(to, spec.height(t) - VIEW));
      deepest = Math.max(deepest, y);
    },
    viewport: () => VIEW,
    images() {
      const bottoms = spec.images(t);
      return { state: String(bottoms.length), lastBottom: bottoms.length ? Math.max(...bottoms) - y : 0 };
    },
  };
  const timing = {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms;
    },
  };
  return { page, timing, elapsed: () => t, deepest: () => deepest, offset: () => y };
}

const range = (n: number, step: number) => Array.from({ length: n }, (_, i) => (i + 1) * step);

describe('scrollThrough', () => {
  it('stops soon after the last image on a page that never ends', async () => {
    const f = fakePage({ height: () => Number.MAX_SAFE_INTEGER, images: () => range(10, 1000) });
    await scrollThrough(f.page, f.timing);
    expect(f.deepest()).toBeGreaterThanOrEqual(10_000 - VIEW);
    expect(f.elapsed()).toBeLessThan(6_000);
    expect(f.offset()).toBe(0);
  });

  it('keeps going while images keep being added', async () => {
    // One more 1000px image every 500ms until there are 20; the page ends just below the last one.
    const count = (t: number) => Math.min(20, Math.floor(t / 500) + 1);
    const f = fakePage({ height: (t) => count(t) * 1000 + 500, images: (t) => range(count(t), 1000) });
    await scrollThrough(f.page, f.timing);
    expect(f.deepest()).toBeGreaterThanOrEqual(20_500 - VIEW);
    expect(f.elapsed()).toBeGreaterThanOrEqual(10_500);
    expect(f.elapsed()).toBeLessThan(14_000);
  });

  it('stops when the page cannot scroll', async () => {
    // Images inside an inner scroll box reach below the window, which itself doesn't scroll.
    const f = fakePage({ height: () => VIEW, images: () => range(5, 1000) });
    await scrollThrough(f.page, f.timing);
    expect(f.elapsed()).toBeLessThanOrEqual(2_000);
  });

  it('gives up at the timeout on an endless image feed', async () => {
    const f = fakePage({ height: () => Number.MAX_SAFE_INTEGER, images: (t) => range(Math.floor(t / 300) + 1, 700) });
    await scrollThrough(f.page, { ...f.timing, timeoutMs: 30_000 });
    expect(f.elapsed()).toBeGreaterThanOrEqual(30_000);
    expect(f.elapsed()).toBeLessThanOrEqual(31_000);
    expect(f.offset()).toBe(0);
  });
});
