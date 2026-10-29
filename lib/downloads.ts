import { browser, type Browser } from 'wxt/browser';

/**
 * Start a download and resolve once it is fully written (so blob URLs can be revoked).
 * Private-window downloads stay out of the normal download history: Firefox files
 * them under the private session; Chrome has no such option, so the entry is erased.
 */
export async function downloadAndWait(url: string, filename: string, incognito = false): Promise<void> {
  const options: Browser.downloads.DownloadOptions & { incognito?: boolean } = {
    url,
    filename,
    conflictAction: 'uniquify' as Browser.downloads.FilenameConflictAction,
    saveAs: false,
  };
  if (incognito && import.meta.env.FIREFOX) options.incognito = true;
  const id = await browser.downloads.download(options);
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
  if (incognito && !import.meta.env.FIREFOX) await browser.downloads.erase({ id });
}
