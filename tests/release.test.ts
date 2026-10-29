import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { isNewer } from '../lib/version';
// @ts-expect-error plain .mjs release scripts have no type declarations
import { releaseNotes } from '../scripts/release-notes.mjs';
// @ts-expect-error plain .mjs release scripts have no type declarations
import { ADDON_ID, updatesJson } from '../scripts/updates-json.mjs';
import { fixture } from './helpers';

describe('isNewer', () => {
  it.each([
    ['0.2.0', '0.1.0', true],
    ['0.10.0', '0.9.3', true],
    ['v1.0.0', '0.9.9', true],
    ['0.2', '0.2.0', false],
    ['0.2.0', '0.2.0', false],
    ['0.1.9', '0.2.0', false],
  ])('%s newer than %s → %s', (a, b, out) => {
    expect(isNewer(a, b)).toBe(out);
  });
});

describe('releaseNotes', () => {
  const changelog = '# Changelog\n\n## [0.3.0] - 2026-11-01\n\n### Added\n- New thing\n\n## [0.2.0] - 2026-10-29\n\n### Fixed\n- Old thing\n';

  it('returns only the requested version section', () => {
    expect(releaseNotes(changelog, '0.3.0')).toBe('### Added\n- New thing');
    expect(releaseNotes(changelog, '0.2.0')).toBe('### Fixed\n- Old thing');
  });

  it('fails when the version is missing', () => {
    expect(() => releaseNotes(changelog, '9.9.9')).toThrow(/no "## 9\.9\.9" section/);
  });

  it('has a section for the version in package.json', () => {
    const { version } = JSON.parse(fixture('../../package.json')) as { version: string };
    expect(releaseNotes(fixture('../../CHANGELOG.md'), version)).not.toBe('');
  });
});

describe('updatesJson', () => {
  it('lists the release with a sha256 of the xpi', () => {
    const xpi = Buffer.from('fake xpi');
    const manifest = updatesJson('0.2.0', xpi, 'https://example.com/a.xpi');
    expect(manifest.addons[ADDON_ID].updates).toEqual([
      {
        version: '0.2.0',
        update_link: 'https://example.com/a.xpi',
        update_hash: `sha256:${createHash('sha256').update(xpi).digest('hex')}`,
      },
    ]);
  });
});
