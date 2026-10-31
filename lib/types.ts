export interface GalleryPage {
  url: string;
  /** Alternate URLs tried in order when `url` fails (mirrors, other hosts). */
  fallbacks?: string[];
  /** Smaller image for the popup grid; defaults to `url`. */
  thumb?: string;
  width?: number;
  height?: number;
}

export interface Gallery {
  /** Extractor id that produced this gallery. */
  extractor: string;
  /** Human-readable site name, used as the top folder (e.g. "mangadex"). */
  site: string;
  series: string;
  volume?: string;
  chapter?: string;
  title?: string;
  language?: string;
  /** Language the series was first published in (e.g. "ja"); decides the reading direction. */
  originalLanguage?: string;
  summary?: string;
  writers?: string[];
  artists?: string[];
  /** Scanlation groups. */
  groups?: string[];
  genres?: string[];
  tags?: string[];
  /** ComicInfo AgeRating value, e.g. "Teen". */
  ageRating?: string;
  /** Total chapters, once the series is finished. */
  count?: number;
  sourceUrl: string;
  /** Referer the image host expects; installs a header rule when set. */
  referer?: string;
  pages: GalleryPage[];
  /** Indices of pages to select by default (the detected reader); all when unset. */
  preselect?: number[];
  /** Opaque data an extractor needs to re-resolve expired page URLs. */
  refresh?: unknown;
}

export type MangadexQuality = 'data' | 'data-saver';

export interface ExtractOptions {
  mangadexQuality: MangadexQuality;
  /** Images whose known width or height is below this many pixels are dropped. */
  minSize: number;
}

export interface ExtractCtx {
  url: URL;
  document: Document;
  options: ExtractOptions;
  fetchJson<T>(url: string): Promise<T>;
}

export interface Extractor {
  id: string;
  matches(url: URL): boolean;
  extract(ctx: ExtractCtx): Promise<Gallery>;
  /** Re-resolve page URLs (same order) when they expire mid-download. */
  refresh?(gallery: Gallery, fetchJson: ExtractCtx['fetchJson']): Promise<GalleryPage[]>;
}

export type SaveFormat = 'folder' | 'zip' | 'cbz';

export interface Settings {
  baseFolder: string;
  /**
   * Folder template; tokens: {site} {series} {chapter} {title} {volume} {number} {lang} {group},
   * optionally zero-padded like {number:000}. Empty segments are dropped.
   */
  folderTemplate: string;
  format: SaveFormat;
  concurrency: number;
  minSize: number;
  mangadexQuality: MangadexQuality;
  /** Show a desktop notification when a job ends (needs the optional notifications permission). */
  notify: boolean;
}

export interface JobSpec {
  id: string;
  gallery: Gallery;
  /** Indices into gallery.pages to download. */
  pages: number[];
  format: SaveFormat;
  /** Download-relative folder path (folder mode) or archive path without extension. */
  folder: string;
  /** Per-page file name stems (no extension), parallel to `pages`. */
  names: string[];
  concurrency: number;
  /** Started from a private window: kept out of history and storage. */
  incognito: boolean;
  /** Overwrite files of the same name instead of adding " (1)" (a retried archive replaces the partial one). */
  replace?: boolean;
}

export type JobStatus = 'running' | 'packing' | 'done' | 'error' | 'cancelled';

export interface JobProgress {
  id: string;
  label: string;
  total: number;
  done: number;
  failed: number[];
  status: JobStatus;
  error?: string;
  incognito: boolean;
  /** Last file written, for showing it in its folder. */
  downloadId?: number;
}
