# Firefox Add-ons (addons.mozilla.org) listing

Everything needed to submit mangashelf to addons.mozilla.org (AMO). Copy each field into
the Developer Hub form.

## Files to upload

```sh
npm ci
npm run zip:amo
```

- **Add-on:** `.output/mangashelf-<version>-amo.zip` (no `update_url`; AMO delivers updates)
- **Source code:** `.output/mangashelf-<version>-amo-sources.zip` (the build is bundled, so
  AMO asks for the source; `BUILDING.md` inside explains how to rebuild it)
- **Screenshot:** `store/screenshot-1.png` (1280×800)

## Listing fields

**Name:** mangashelf: Manga & CBZ Downloader (set in the store build's manifest; the suffix
tells it apart from the unrelated "Manga Shelf" add-on already listed)

**URL slug:** mangashelf

**Summary** (250 characters max):

> Save manga chapters and image galleries as a folder, ZIP or CBZ with one click. Built-in
> MangaDex support, an image picker for any other site, and CBZ files ready for YACReader,
> Kavita or Komga.

**Description:**

> mangashelf turns the chapter or gallery you're looking at into files you can keep and read
> offline.
>
> - Open a chapter, click the mangashelf button, pick the pages, and download.
> - Save as a folder of numbered images, a ZIP, or a CBZ comic archive.
> - CBZ files include ComicInfo.xml (series, chapter, volume, reading direction), so comic
>   readers like YACReader, Kavita and Komga sort and display them correctly.
> - MangaDex chapters are read straight from MangaDex's API, with a choice of original or
>   data-saver quality.
> - On any other site, the image picker lists every image on the page, pre-selects the
>   chapter's pages, and can scroll the page to load images that appear while scrolling.
> - Downloads keep running after you close the popup, retry failed pages, and report any
>   page that couldn't be saved.
> - Downloads started in a private window stay out of normal windows and out of the
>   download history.
>
> Please only download content you're allowed to keep, and respect each site's terms.
>
> Open source (MIT): https://github.com/EldinBegano/mangashelf

**Categories:** Download Management; Photos, Music & Videos

**Tags:** manga, comics, cbz, downloader, images, webtoon, mangadex, offline reading

**Homepage:** https://eldinbegano.github.io/mangashelf/

**Support site:** https://github.com/EldinBegano/mangashelf/issues

**License:** MIT License

**Privacy policy:** none needed. mangashelf collects no data; the manifest declares
`data_collection_permissions: none`.

**Compatibility:** Firefox for desktop only. Leave Android unticked; the download flow
hasn't been tested there.

## Notes to reviewer

> Build: Node.js 22+, then `npm ci && npm run zip:amo`. Output:
> `.output/mangashelf-<version>-amo.zip`. Full steps in BUILDING.md inside the source zip.
>
> Permissions:
> - `<all_urls>`: the user can open the popup on any site; mangashelf injects a content
>   script on click (via `scripting`) to list the page's images, and fetches those images
>   from whatever host serves them.
> - `declarativeNetRequest`: sets the page's Referer on mangashelf's own image requests
>   (requests not tied to a tab only), because many image hosts reject requests without it.
>   Rules are session rules and never touch normal browsing.
> - `downloads`: saves the images or the ZIP/CBZ archive.
> - `contextMenus`: "Download image with mangashelf" and "Download all pages with mangashelf".
> - `storage`: settings and the download list.
>
> No remote code, no analytics, no data sent anywhere except requests to the site the user
> is on, its image hosts, and the MangaDex API on MangaDex pages.
>
> Third-party code: Svelte runtime (UI) and fflate (ZIP). The `innerHTML` warning from the
> linter is Svelte's runtime cloning static templates, not dynamic content.

## Submission checklist

1. Sign in at https://addons.mozilla.org/developers/ with a Firefox account.
2. **Submit a New Add-on** → **On this site** (listed).
3. Upload the `-amo.zip`, tick Firefox only.
4. Answer **Yes** to "Do you need to submit source code?" and upload the `-amo-sources.zip`.
5. Fill in the listing fields above, add the screenshot, paste the reviewer notes.
6. Submit. Automatic checks run right away; a human review can take days to a few weeks.
7. Once it's approved, add an "Available on Firefox Add-ons" link to the README and the
   landing page.

**Later releases:** run `npm run zip:amo` and upload the new version in the Developer Hub
(**Manage Status & Versions** → **Upload a New Version**), again with the sources zip.

**If the review objects to site support:** reviewers may object to adapters for sites that
host unlicensed manga. Then the listed build can ship without the Manganato adapter
(MangaDex and the generic picker only) while GitHub releases keep it.
