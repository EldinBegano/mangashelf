# Building

Requirements: Node.js 22 or newer and npm.

```sh
npm ci
npm test               # unit tests
npm run zip:amo        # Firefox Add-ons build   → .output/mangashelf-<version>-amo.zip
npm run zip:firefox    # self-hosted Firefox build (GitHub releases, has update_url)
npm run zip            # Chrome build            → .output/mangashelf-<version>-chrome.zip
```

`npm run dev` / `npm run dev:firefox` start a browser with the extension loaded and reload it
on changes. Source layout: `entrypoints/` (background, popup, options, content script,
offscreen page), `lib/` (site extractors, download jobs, archives), `tests/`.
