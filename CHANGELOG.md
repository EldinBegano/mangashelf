# Changelog

## [0.2.1] - 2026-10-29

### Fixed
- Files got the wrong extension when a site mislabeled them (e.g. JPEGs saved as `.png`), so comic readers refused to open them

## [0.2.0] - 2026-10-29

### Added
- Automatic updates in Firefox/Floorp; Chrome shows a notice in the popup when a new version is out
- Support for Manganato, Manganami, MangaKakalot and MangaNelo
- List of tested sites (SUPPORTED_SITES.md)

### Changed
- On sites without dedicated support, only the chapter's images are selected by default

### Fixed
- Downloads from private windows showed up in normal windows and in the browser's download history
- Pages that load while scrolling (e.g. Webtoons) were skipped as too small
- Cloudflare check pages in languages other than English weren't recognized

## [0.1.0] - 2026-10-29

First version: MangaDex support, an image picker for any site, and saving as a folder, ZIP or CBZ.
