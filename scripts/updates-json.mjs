// Firefox self-hosted update manifest for one release:
// node scripts/updates-json.mjs <version> <xpi path> <download URL> > updates.json
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const ADDON_ID = 'mangashelf@eldinbegano';

export function updatesJson(version, xpi, link) {
  const hash = createHash('sha256').update(xpi).digest('hex');
  return {
    addons: {
      [ADDON_ID]: {
        updates: [{ version, update_link: link, update_hash: `sha256:${hash}` }],
      },
    },
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [version, xpiPath, link] = process.argv.slice(2);
  console.log(JSON.stringify(updatesJson(version, readFileSync(xpiPath), link), null, 2));
}
