import type { Gallery } from './types';

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

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

interface CentralEntry {
  name: Uint8Array;
  flags: number;
  crc: number;
  size: number;
  offset: number;
}

/**
 * Store-only ZIP (images are already compressed), written one file at a time.
 * Each file becomes its own Blob as it is added, so the page bytes can be freed and the final
 * archive is a Blob of Blobs: no single buffer holds the whole chapter, and nothing is copied
 * at the end. Sizes and CRC go in the local headers (no data descriptors), which every reader
 * accepts, including Java's ZipInputStream for stored entries.
 */
export class ArchiveWriter {
  private parts: Blob[] = [];
  private central: CentralEntry[] = [];
  private offset = 0;
  private readonly time: number;
  private readonly date: number;

  constructor(mtime = new Date()) {
    this.time = (mtime.getHours() << 11) | (mtime.getMinutes() << 5) | (mtime.getSeconds() >> 1);
    this.date = ((Math.max(1980, mtime.getFullYear()) - 1980) << 9) | ((mtime.getMonth() + 1) << 5) | mtime.getDate();
  }

  get count(): number {
    return this.central.length;
  }

  add(filename: string, data: Uint8Array<ArrayBuffer>): void {
    const name = new TextEncoder().encode(filename);
    // Bit 11: the name is UTF-8.
    const flags = /^[\x20-\x7e]*$/.test(filename) ? 0 : 0x800;
    const entry = { name, flags, crc: crc32(data), size: data.length, offset: this.offset };
    if (this.central.length >= 0xffff || this.offset + 30 + name.length + data.length > 0xffffffff) {
      throw new Error('Archive too large (ZIP64 is not supported)');
    }
    const header = new Uint8Array(30 + name.length);
    const v = new DataView(header.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true); // version needed
    v.setUint16(6, flags, true);
    v.setUint16(8, 0, true); // stored
    v.setUint16(10, this.time, true);
    v.setUint16(12, this.date, true);
    v.setUint32(14, entry.crc, true);
    v.setUint32(18, entry.size, true);
    v.setUint32(22, entry.size, true);
    v.setUint16(26, name.length, true);
    v.setUint16(28, 0, true); // extra length
    header.set(name, 30);
    this.parts.push(new Blob([header, data]));
    this.central.push(entry);
    this.offset += header.length + data.length;
  }

  /** Central directory and end record; the writer can't be used afterwards. */
  finish(type: string): Blob {
    const size = this.central.reduce((n, e) => n + 46 + e.name.length, 0);
    const out = new Uint8Array(size + 22);
    const v = new DataView(out.buffer);
    let p = 0;
    for (const e of this.central) {
      v.setUint32(p, 0x02014b50, true);
      v.setUint16(p + 4, 20, true); // version made by
      v.setUint16(p + 6, 20, true); // version needed
      v.setUint16(p + 8, e.flags, true);
      v.setUint16(p + 10, 0, true); // stored
      v.setUint16(p + 12, this.time, true);
      v.setUint16(p + 14, this.date, true);
      v.setUint32(p + 16, e.crc, true);
      v.setUint32(p + 20, e.size, true);
      v.setUint32(p + 24, e.size, true);
      v.setUint16(p + 28, e.name.length, true);
      // extra, comment, disk, internal and external attributes stay 0
      v.setUint32(p + 42, e.offset, true);
      out.set(e.name, p + 46);
      p += 46 + e.name.length;
    }
    v.setUint32(p, 0x06054b50, true);
    v.setUint16(p + 8, this.central.length, true);
    v.setUint16(p + 10, this.central.length, true);
    v.setUint32(p + 12, size, true);
    v.setUint32(p + 16, this.offset, true);
    const blob = new Blob([...this.parts, out], { type });
    this.parts = [];
    this.central = [];
    return blob;
  }
}
