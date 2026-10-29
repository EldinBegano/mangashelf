import { extensionFor, sniffImage } from './naming';

export interface FetchedImage {
  data: Uint8Array<ArrayBuffer>;
  type: string;
  ext: string;
}

const RETRIES = 3;
/** A stalled connection would otherwise hold its worker (and the job) forever. */
const TIMEOUT_MS = 60_000;
const MAX_RETRY_AFTER_MS = 60_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly retryAfterMs?: number,
  ) {
    super(`HTTP ${status}`);
  }
}

/** Delay a Retry-After header asks for (seconds or an HTTP date), capped at a minute. */
export function retryAfterMs(header: string | null, now = Date.now()): number | undefined {
  if (!header?.trim()) return undefined;
  const seconds = Number(header);
  const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - now;
  return Number.isFinite(ms) ? Math.min(Math.max(ms, 0), MAX_RETRY_AFTER_MS) : undefined;
}

async function fetchOnce(url: string): Promise<FetchedImage> {
  const res = await fetch(url, { credentials: 'include', signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new HttpError(res.status, retryAfterMs(res.headers.get('retry-after')));
  const type = res.headers.get('content-type') ?? '';
  if (/^text\/html/i.test(type)) throw new Error('Got an HTML page instead of an image');
  const data = new Uint8Array(await res.arrayBuffer());
  if (data.length === 0) throw new Error('Empty response');
  const sniffed = sniffImage(data);
  return {
    data,
    type: sniffed?.type ?? (type.split(';')[0] || 'application/octet-stream'),
    ext: sniffed?.ext ?? extensionFor(type, url),
  };
}

/** Try each URL with exponential backoff (or the server's Retry-After); throws the last error when all fail. */
export async function fetchImage(urls: string[]): Promise<FetchedImage> {
  let lastError: unknown;
  for (const url of urls) {
    for (let attempt = 0; attempt < RETRIES; attempt++) {
      try {
        return await fetchOnce(url);
      } catch (err) {
        lastError = err;
        const http = err instanceof HttpError ? err : undefined;
        // 4xx other than 429 will not get better by retrying the same URL.
        if (http && http.status >= 400 && http.status < 500 && http.status !== 429) break;
        if (attempt < RETRIES - 1) await sleep(http?.retryAfterMs ?? 500 * 2 ** attempt);
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
