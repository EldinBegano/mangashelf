import { browser } from 'wxt/browser';
import type { ScanResult } from './extractors';
import type { ExtractOptions, Gallery, JobProgress, JobSpec, MangadexQuality, SaveFormat } from './types';

export type Message =
  | { type: 'scan'; tabId: number; autoScroll?: boolean; mangadexQuality?: MangadexQuality }
  | { type: 'download'; gallery: Gallery; pages: number[]; format: SaveFormat; tabId: number }
  | { type: 'jobs'; incognito: boolean }
  | { type: 'cancel'; id: string }
  /** Download a finished job's failed pages again (the whole archive for ZIP/CBZ). */
  | { type: 'retry'; id: string }
  /** Offscreen document → background: write a blob URL to disk (Chrome only). */
  | { type: 'save'; url: string; filename: string; incognito: boolean; replace?: boolean }
  /** Background → offscreen document: run a job (Chrome only). */
  | { type: 'job:start'; spec: JobSpec }
  /** Background → offscreen document: stop a job; replies whether it was running (Chrome only). */
  | { type: 'job:cancel'; id: string }
  /** Broadcast to background and popup. */
  | { type: 'job:progress'; progress: JobProgress };

type Reply = { ok: true; value: unknown } | { ok: false; error: string };

export type Handlers = {
  [K in Message['type']]?: (msg: Extract<Message, { type: K }>) => unknown;
};

/** Handle the given message types in this context; others are left for other listeners. */
export function listen(handlers: Handlers): void {
  browser.runtime.onMessage.addListener((msg: Message, _sender, sendResponse: (r: Reply) => void) => {
    const handler = handlers[msg?.type] as ((m: Message) => unknown) | undefined;
    if (!handler) return false;
    Promise.resolve()
      .then(() => handler(msg))
      .then(
        (value) => sendResponse({ ok: true, value }),
        (err) => sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) }),
      );
    return true;
  });
}

export async function send<T = unknown>(msg: Message): Promise<T> {
  const reply = (await browser.runtime.sendMessage(msg)) as Reply | undefined;
  if (!reply) throw new Error(`No handler for ${msg.type}`);
  if (!reply.ok) throw new Error(reply.error);
  return reply.value as T;
}

/** Fire-and-forget broadcast; nobody listening is fine. */
export function broadcast(msg: Message): void {
  browser.runtime.sendMessage(msg).catch(() => {});
}

/** Shape returned by the injected scanner (structured-clone safe). */
export type ScanReply = ScanResult | { error: string };

export type ScanFn = (options: ExtractOptions, autoScroll: boolean) => Promise<ScanReply>;
