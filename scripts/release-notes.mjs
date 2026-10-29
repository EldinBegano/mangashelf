// Prints the CHANGELOG.md section for one version: node scripts/release-notes.mjs 0.2.0
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function releaseNotes(changelog, version) {
  const lines = changelog.split('\n');
  const start = lines.findIndex((l) => new RegExp(`^## \\[?${version.replace(/\./g, '\\.')}\\]?(\\s|$)`).test(l));
  if (start === -1) throw new Error(`CHANGELOG.md has no "## ${version}" section`);
  const end = lines.findIndex((l, i) => i > start && l.startsWith('## '));
  return lines.slice(start + 1, end === -1 ? undefined : end).join('\n').trim();
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(releaseNotes(readFileSync('CHANGELOG.md', 'utf8'), process.argv[2]));
}
