// Prints the --amo-metadata JSON that web-ext sign sends with a new version:
// node scripts/amo-metadata.mjs 0.3.1
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { releaseNotes } from './release-notes.mjs';

/** CHANGELOG Markdown as plain text; AMO shows release notes as written, without Markdown. */
export function plainNotes(markdown) {
  return markdown
    .replace(/^### (.+)$/gm, '$1:')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

/**
 * The quoted "Notes to reviewer" in store/firefox-add-ons.md, with the quote markers
 * removed and wrapped lines joined back into one line per paragraph or list item.
 */
export function reviewerNotes(storeDoc) {
  const lines = storeDoc.split('\n');
  const start = lines.findIndex((l) => /^## Notes to reviewer/.test(l));
  if (start === -1) throw new Error('store/firefox-add-ons.md has no "## Notes to reviewer" section');
  const end = lines.findIndex((l, i) => i > start && l.startsWith('## '));
  const out = [];
  for (const line of lines.slice(start + 1, end === -1 ? undefined : end)) {
    if (!line.startsWith('>')) continue;
    const text = line.replace(/^>\s?/, '').trim();
    const last = out.length - 1;
    if (text && last >= 0 && out[last] !== '' && !text.startsWith('- ')) out[last] += ` ${text}`;
    else out.push(text);
  }
  return out.join('\n').trim();
}

export function amoMetadata(version, changelog, storeDoc) {
  return {
    version: {
      release_notes: { 'en-US': plainNotes(releaseNotes(changelog, version)) },
      approval_notes: reviewerNotes(storeDoc).replaceAll('<version>', version),
      // Desktop only; the download flow isn't tested on Android.
      compatibility: ['firefox'],
    },
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const metadata = amoMetadata(
    process.argv[2],
    readFileSync('CHANGELOG.md', 'utf8'),
    readFileSync('store/firefox-add-ons.md', 'utf8'),
  );
  console.log(JSON.stringify(metadata, null, 2));
}
