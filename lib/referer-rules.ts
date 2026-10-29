import { browser, type Browser } from 'wxt/browser';
import type { Gallery } from './types';

type Rule = Browser.declarativeNetRequest.Rule;

function hostsOf(gallery: Gallery): Set<string> {
  const hosts = new Set<string>();
  for (const page of gallery.pages) {
    for (const url of [page.url, page.thumb, ...(page.fallbacks ?? [])]) {
      if (url) hosts.add(new URL(url).hostname);
    }
  }
  return hosts;
}

/**
 * Hotlink-protected hosts reject requests without the reader page as Referer.
 * Session rules (cleared on browser restart) set it, but only for requests that
 * do not come from a tab (tabId -1): our offscreen/background fetches and the popup.
 */
export async function ensureRefererRules(gallery: Gallery): Promise<void> {
  const dnr = browser.declarativeNetRequest;
  if (!gallery.referer || !dnr?.updateSessionRules) return;
  const existing = await dnr.getSessionRules();
  const byHost = new Map(existing.map((r) => [r.condition.requestDomains?.[0], r]));
  let nextId = Math.max(0, ...existing.map((r) => r.id)) + 1;
  const addRules: Rule[] = [];
  const removeRuleIds: number[] = [];
  for (const host of hostsOf(gallery)) {
    const current = byHost.get(host);
    if (current?.action.requestHeaders?.[0]?.value === gallery.referer) continue;
    if (current) removeRuleIds.push(current.id);
    addRules.push({
      id: current?.id ?? nextId++,
      priority: 1,
      action: {
        type: 'modifyHeaders' as Rule['action']['type'],
        requestHeaders: [
          { header: 'Referer', operation: 'set' as Browser.declarativeNetRequest.HeaderOperation, value: gallery.referer },
        ],
      },
      condition: {
        requestDomains: [host],
        tabIds: [-1],
        resourceTypes: ['xmlhttprequest', 'image', 'other'] as Browser.declarativeNetRequest.ResourceType[],
      },
    });
  }
  if (addRules.length) await dnr.updateSessionRules({ addRules, removeRuleIds });
}
