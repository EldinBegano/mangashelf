# Supported sites

Last checked: 2026-10-29. Sites change often, so a site that works today can break later.

## Full support

mangashelf knows these sites and reads the series name, chapter number and every page
directly.

| Site | Pages to open |
|---|---|
| [MangaDex](https://mangadex.org) | Chapter pages (`/chapter/…`) |
| [Manganato](https://www.manganato.gg) | Chapter pages (`/manga/<name>/chapter-<n>`) |
| [Manganami](https://www.manganami.com) (also natomanga.com) | Chapter pages |
| [MangaKakalot](https://www.kakamanga.com) (also mangakakalot.gg) | Chapter pages |
| [MangaNelo](https://www.nelomanga.net) | Chapter pages |

## Works with the image picker

No dedicated support, but the generic picker finds the chapter's images and pre-selects
them. Other images on the page (covers, banners) are listed but left unticked.

| Site | Notes |
|---|---|
| [Webtoons](https://www.webtoons.com) | Episode pages |
| [Weeb Central](https://weebcentral.com) | Chapter pages |
| [Asura Scans](https://asurascans.com) | Chapter pages |
| [MangaRead](https://www.mangaread.org) | Chapter pages. Other sites built on the same WordPress manga theme (Madara) should work the same way. |
| [Imgur](https://imgur.com) | Pictures only, not videos or GIFs. For long albums, use **Scroll & rescan**. |
| [Wikipedia](https://www.wikipedia.org) | Article images |

## Partial

| Site | Problem |
|---|---|
| [MangaFire](https://mangafire.to) | Page-by-page reader: only the few pages near the current one are found. |

## Not supported

| Site | Why |
|---|---|
| [MANGA Plus](https://mangaplus.shueisha.co.jp) | Pages are encrypted and only decoded inside the reader. |

## Any other site

Open the page and click the mangashelf icon. If the pictures are ordinary images on the
page, they show up in the picker. It won't work when:

- the reader shows one page per link (you click "next" for every page)
- pages are drawn on a canvas, cut into scrambled tiles, or encrypted
- pages only appear after logging in and you aren't logged in
