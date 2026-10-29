import { browser } from 'wxt/browser';
import { isNewer } from './version';

export const REPO = 'EldinBegano/mangashelf';
const CHECK_EVERY_MS = 24 * 60 * 60 * 1000;

interface LatestRelease {
  checkedAt: number;
  version: string;
  url: string;
}

export interface UpdateInfo {
  version: string;
  url: string;
}

/**
 * Latest GitHub release, asked for at most once a day. Firefox/Floorp update
 * themselves through `update_url`; this is for builds that can't (Chrome unpacked).
 */
export async function checkForUpdate(current: string): Promise<UpdateInfo | undefined> {
  const { latestRelease } = await browser.storage.local.get('latestRelease');
  let latest = latestRelease as LatestRelease | undefined;
  if (!latest || Date.now() - latest.checkedAt > CHECK_EVERY_MS) {
    try {
      const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
        headers: { Accept: 'application/vnd.github+json' },
      });
      if (res.ok) {
        const release = (await res.json()) as { tag_name: string; html_url: string };
        latest = { checkedAt: Date.now(), version: release.tag_name.replace(/^v/, ''), url: release.html_url };
        await browser.storage.local.set({ latestRelease: latest });
      }
    } catch {
      // Offline or rate-limited: try again next time the popup opens.
    }
  }
  return latest && isNewer(latest.version, current) ? { version: latest.version, url: latest.url } : undefined;
}
