# Releasing

1. Add a section for the new version at the top of `CHANGELOG.md` (`## [0.3.0] - YYYY-MM-DD`)
   and commit it.
2. `npm version 0.3.0 -m "chore: release %s"`. This bumps `package.json`, commits and tags `v0.3.0`.
3. `git push --follow-tags`

Pushing the tag runs `.github/workflows/release.yml`: tests, builds Chrome and Firefox, and
publishes a GitHub release with the changelog section as notes, plus:

- `mangashelf-<version>-firefox.xpi`
- `mangashelf-<version>-chrome.zip`
- `updates.json`: Firefox/Floorp read this through `update_url` and install the new
  version within a day (or right away via `about:addons` → gear → **Check for Updates**).

The workflow stops if the tag doesn't match `package.json` or the changelog has no section
for the version.
