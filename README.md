# mangashelf

Browser extension that downloads manga chapters and image galleries as a folder of
numbered images, a ZIP, or a CBZ.

## Install

**Firefox / Floorp / LibreWolf**
1. Open `about:addons` → gear icon → **Install Add-on From File…**
2. Pick `mangashelf-firefox.xpi` and click **Add**.
3. Puzzle-piece menu → gear next to mangashelf → **Pin to Toolbar**.

Regular Firefox only installs add-ons signed by Mozilla. Floorp and LibreWolf don't need that.

**Chrome / Chromium / Brave / Edge**
1. Open `chrome://extensions` and turn on **Developer mode**.
2. **Load unpacked** → pick the `chrome-mv3` folder.

## Use

1. Open a chapter or gallery and click the mangashelf icon.
2. Pick pages (Shift+click selects a range) and choose **Folder**, **ZIP** or **CBZ**.
3. Click **Download**. You can close the popup; the download keeps going.

Files go to `Downloads/mangashelf/<site>/<series>/<chapter>/`.
Settings (⚙ in the popup): save location, default format, parallel downloads, MangaDex quality.

Right-click any image → **Download image with mangashelf**.

**Private windows:** downloads started in a private window show only in private windows,
aren't kept in the browser's download history, and are forgotten when the last private
window closes. The files still save to Downloads. In Firefox/Floorp, allow
**Run in Private Windows** for mangashelf in `about:addons` first.

## Supported sites

- **Full support:** MangaDex and the Manganato family (Manganato, Manganami, MangaKakalot, MangaNelo)
- **Tested with the image picker:** Webtoons, Weeb Central, Asura Scans, MangaRead, Imgur
- **Other sites:** shows every image on the page to pick from. If images load as you
  scroll, click **Scroll & rescan**.

Full list and known problems: [SUPPORTED_SITES.md](SUPPORTED_SITES.md).
