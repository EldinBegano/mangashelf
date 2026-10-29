import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { downloadAndWait } from '@/lib/downloads';
import { listJobs, recordProgress, startJob } from '@/lib/job-host';
import { listen, type ScanFn, type ScanReply } from '@/lib/messages';
import { jobLabel } from '@/lib/job-runner';
import { folderPath, pageNames, stemFromUrl } from '@/lib/naming';
import { ensureRefererRules } from '@/lib/referer-rules';
import { getSettings } from '@/lib/settings';
import type { Gallery, MangadexQuality, SaveFormat } from '@/lib/types';
import type { ScanResult } from '@/lib/extractors';

const MENU_IMAGE = 'mangashelf-image';
const MENU_PAGE = 'mangashelf-page';

async function scanTab(tabId: number, autoScroll = false, quality?: MangadexQuality): Promise<ScanResult> {
  const settings = await getSettings();
  const options = { minSize: settings.minSize, mangadexQuality: quality ?? settings.mangadexQuality };
  await browser.scripting.executeScript({ target: { tabId }, files: ['/content-scripts/scanner.js'] });
  const [injection] = await browser.scripting.executeScript({
    target: { tabId },
    func: ((opts, scroll) => (globalThis as unknown as { __mangashelfScan: ScanFn }).__mangashelfScan(opts, scroll)) as ScanFn,
    args: [options, autoScroll],
  });
  const reply = injection?.result as ScanReply | undefined;
  if (!reply) throw new Error('The page did not return a scan result');
  if ('error' in reply) throw new Error(reply.error);
  await ensureRefererRules(reply.gallery);
  return reply;
}

async function startDownload(gallery: Gallery, pages: number[], format: SaveFormat, names?: string[]) {
  if (pages.length === 0) throw new Error('No pages selected');
  const settings = await getSettings();
  const allNames = pageNames(gallery.pages.length);
  const spec = {
    id: crypto.randomUUID(),
    gallery,
    pages,
    format,
    folder: folderPath(settings.baseFolder, settings.folderTemplate, gallery),
    names: names ?? pages.map((i) => allNames[i]!),
    concurrency: settings.concurrency,
  };
  await ensureRefererRules(gallery);
  recordProgress({ id: spec.id, label: jobLabel(spec), total: pages.length, done: 0, failed: [], status: 'running' });
  await startJob(spec);
  return spec.id;
}

export default defineBackground({
  persistent: true,
  main() {
    listen({
      scan: ({ tabId, autoScroll, mangadexQuality }) => scanTab(tabId, autoScroll, mangadexQuality),
      download: ({ gallery, pages, format }) => startDownload(gallery, pages, format),
      jobs: () => listJobs(),
      save: ({ url, filename }) => downloadAndWait(url, filename),
      'job:progress': ({ progress }) => recordProgress(progress),
    });

    browser.runtime.onInstalled.addListener(async () => {
      // Menus survive updates; recreating them with the same id would fail.
      await browser.contextMenus.removeAll();
      browser.contextMenus.create({ id: MENU_IMAGE, title: 'Download image with mangashelf', contexts: ['image'] });
      browser.contextMenus.create({ id: MENU_PAGE, title: 'Download all pages with mangashelf', contexts: ['page'] });
    });

    browser.contextMenus.onClicked.addListener(async (info, tab) => {
      try {
        if (info.menuItemId === MENU_IMAGE && info.srcUrl) {
          const pageUrl = info.pageUrl ?? tab?.url ?? info.srcUrl;
          const gallery: Gallery = {
            extractor: 'generic',
            site: new URL(pageUrl).hostname.replace(/^www\./, ''),
            series: 'images',
            sourceUrl: pageUrl,
            referer: pageUrl,
            pages: [{ url: info.srcUrl }],
          };
          await startDownload(gallery, [0], 'folder', [stemFromUrl(info.srcUrl)]);
        } else if (info.menuItemId === MENU_PAGE && tab?.id !== undefined) {
          const { gallery } = await scanTab(tab.id);
          const settings = await getSettings();
          await startDownload(gallery, gallery.pages.map((_, i) => i), settings.format);
        }
      } catch (err) {
        console.error('[mangashelf] context menu download failed', err);
      }
    });
  },
});
