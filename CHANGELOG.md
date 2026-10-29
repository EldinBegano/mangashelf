# Changelog

## [0.3.0] - 2026-10-29

### Added
- Cancel a running download, retry one with failed pages (a folder gets just the missing pages; a ZIP/CBZ is rebuilt and replaces the incomplete one), and show a finished download in its folder
- Download progress on the toolbar icon, with a red **!** when a download had failed pages
- Optional notification when a download finishes (turn it on in the settings)
- CBZ files from MangaDex now include authors, artists, summary, genres and tags, scanlation group, age rating and, for finished series, the chapter count

### Fixed
- Korean and Chinese titles from MangaDex opened right to left in comic readers
- A stalled connection could leave a download stuck forever
- Downloads ignored a site's request to slow down and failed sooner than needed
- Long MangaDex downloads failed partway through when page links expired a second time
- Downloads started at the same moment could fail
- The download list could lose entries in Chrome after a while

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
