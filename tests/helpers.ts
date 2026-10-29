import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ExtractOptions } from '../lib/types';

export const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');

export const fixtureJson = <T = unknown>(name: string): T => JSON.parse(fixture(name)) as T;

export function htmlDocument(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

export const options: ExtractOptions = { minSize: 300, mangadexQuality: 'data' };

/** fetchJson stub serving fixtures by URL substring. */
export function routes(map: Record<string, string>) {
  return async <T>(url: string): Promise<T> => {
    const hit = Object.entries(map).find(([part]) => url.includes(part));
    if (!hit) throw new Error(`HTTP 404 for ${url}`);
    return fixtureJson<T>(hit[1]);
  };
}
