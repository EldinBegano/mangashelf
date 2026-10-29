import { zipSync, strToU8, type Zippable } from 'fflate';
import type { Gallery } from './types';

export interface ArchiveEntry {
  name: string;
  data: Uint8Array<ArrayBuffer>;
}

function xml(text: string): string {
  return text.replace(/[<>&'"]/g, (c) => `&${{ '<': 'lt', '>': 'gt', '&': 'amp', "'": 'apos', '"': 'quot' }[c]};`);
}

/** ComicInfo.xml (Anansi schema v2) understood by Komga, Kavita, YACReader, etc. */
export function comicInfo(g: Gallery, pageCount: number): string {
  const fields: Array<[string, string | number | undefined]> = [
    ['Title', g.title],
    ['Series', g.series],
    ['Number', g.chapter],
    ['Volume', g.volume],
    ['PageCount', pageCount],
    ['Web', g.sourceUrl],
    ['Tags', g.tags?.join(', ')],
    ['LanguageISO', g.language],
    ['Manga', g.extractor === 'generic' ? undefined : 'YesAndRightToLeft'],
  ];
  const body = fields
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `  <${k}>${xml(String(v))}</${k}>`)
    .join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>\n<ComicInfo xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">\n${body}\n</ComicInfo>\n`;
}

/** Store-only zip (images are already compressed). Pass a gallery to add ComicInfo.xml (CBZ). */
export function buildArchive(entries: ArchiveEntry[], gallery?: Gallery): Uint8Array {
  const files: Zippable = {};
  for (const e of entries) files[e.name] = [e.data, { level: 0 }];
  if (gallery) files['ComicInfo.xml'] = strToU8(comicInfo(gallery, entries.length));
  return zipSync(files);
}
