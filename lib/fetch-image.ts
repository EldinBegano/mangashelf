import { extensionFor, sniffImage } from './naming';

export interface FetchedImage {
  data: Uint8Array<ArrayBuffer>;
  type: string;
  ext: string;
}

const RETRIES = 3;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchOnce(url: string): Promise<FetchedImage> {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
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

/** Try each URL with exponential backoff; throws the last error when all fail. */
export async function fetchImage(urls: string[]): Promise<FetchedImage> {
  let lastError: unknown;
  for (const url of urls) {
    for (let attempt = 0; attempt < RETRIES; attempt++) {
      try {
        return await fetchOnce(url);
      } catch (err) {
        lastError = err;
        // 4xx other than 429 will not get better by retrying the same URL.
        if (err instanceof Error && /^HTTP 4(?!29)/.test(err.message)) break;
        await sleep(500 * 2 ** attempt);
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
