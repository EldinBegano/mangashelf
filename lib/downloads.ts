import { browser, type Browser } from 'wxt/browser';

/** Start a download and resolve once it is fully written (so blob URLs can be revoked). */
export async function downloadAndWait(url: string, filename: string): Promise<void> {
  const id = await browser.downloads.download({ url, filename, conflictAction: 'uniquify', saveAs: false });
  await new Promise<void>((resolve, reject) => {
    const finish = (state: string | undefined, error?: string) => {
      if (state === 'complete') resolve();
      else if (state === 'interrupted') reject(new Error(`Download interrupted: ${error ?? 'unknown error'}`));
      else return;
      browser.downloads.onChanged.removeListener(listener);
    };
    const listener = (delta: Browser.downloads.DownloadDelta) => {
      if (delta.id === id) finish(delta.state?.current, delta.error?.current);
    };
    browser.downloads.onChanged.addListener(listener);
    browser.downloads.search({ id }).then(([item]) => finish(item?.state, item?.error));
  });
}
