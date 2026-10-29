# mangashelf

Browser extension that downloads manga chapters and image galleries as a folder of
numbered images, a ZIP, or a CBZ.

## Install

Download the latest version from the
[Releases page](https://github.com/EldinBegano/mangashelf/releases/latest).

**Firefox / Floorp / LibreWolf**
1. Download `mangashelf-<version>-firefox.xpi`.
2. Open `about:addons` → gear icon → **Install Add-on From File…** → pick the file → **Add**.
3. Puzzle-piece menu → gear next to mangashelf → **Pin to Toolbar**.

Updates install automatically. Regular Firefox only installs add-ons signed by Mozilla;
Floorp and LibreWolf don't need that.

**Chrome / Chromium / Brave / Edge**
1. Download `mangashelf-<version>-chrome.zip` and unzip it into a folder you keep.
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick that folder.

When a new version is out, the popup says so. Unzip the new version over the same
folder, then click the reload icon on mangashelf in `chrome://extensions`. Your settings stay.

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
