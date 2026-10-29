import { zipSync, strToU8, type Zippable } from 'fflate';
import type { Gallery } from './types';

export interface ArchiveEntry {
  name: string;
  data: Uint8Array<ArrayBuffer>;
}

function xml(text: string): string {
  return text
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '') // not allowed anywhere in XML 1.0
    .replace(/[<>&'"]/g, (c) => `&${{ '<': 'lt', '>': 'gt', '&': 'amp', "'": 'apos', '"': 'quot' }[c]};`);
}

/** ComicInfo `Manga` value: Japanese manga reads right to left, Korean and Chinese comics left to right. */
function mangaValue(originalLanguage?: string): string | undefined {
  if (originalLanguage === 'ja') return 'YesAndRightToLeft';
  if (originalLanguage === 'ko' || originalLanguage?.startsWith('zh')) return 'Yes';
  return undefined;
}

/** Count and Volume are xs:int; strict parsers reject a "1.5" there. */
const integer = (value?: string | number) => (/^\d+$/.test(String(value ?? '')) ? value : undefined);

const list = (values?: string[]) => values?.join(', ');

/**
 * ComicInfo.xml (Anansi schema v2.1) understood by Komga, Kavita, YACReader, etc.
 * Fields follow the schema's sequence order, which strict parsers enforce.
 */
export function comicInfo(g: Gallery, pageCount: number): string {
  const fields: Array<[string, string | number | undefined]> = [
    ['Title', g.title],
    ['Series', g.series],
    ['Number', g.chapter],
    ['Count', integer(g.count)],
    ['Volume', integer(g.volume)],
    ['Summary', g.summary],
    ['Writer', list(g.writers)],
    ['Penciller', list(g.artists)],
    ['Translator', list(g.groups)],
    ['Genre', list(g.genres)],
    ['Tags', list(g.tags)],
    ['Web', g.sourceUrl],
    ['PageCount', pageCount],
    ['LanguageISO', g.language],
    ['Manga', mangaValue(g.originalLanguage)],
    ['AgeRating', g.ageRating],
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
