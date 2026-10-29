import { defineConfig } from 'wxt';

// Chrome builds MV3 (service worker + offscreen document for long jobs).
// Firefox builds MV2 (WXT default) so the background page can stay persistent
// and run download jobs itself.

// MANGASHELF_STORE=amo builds for addons.mozilla.org, which delivers updates
// itself and rejects add-ons that declare their own update_url.
const forAmo = process.env.MANGASHELF_STORE === 'amo';

export default defineConfig({
  modules: ['@wxt-dev/module-svelte'],
  zip: forAmo
    ? {
        artifactTemplate: '{{name}}-{{version}}-amo.zip',
        sourcesTemplate: '{{name}}-{{version}}-amo-sources.zip',
        // Reviewers only need what builds the add-on.
        excludeSources: ['store/**', 'docs/**', '.github/**'],
      }
    : {},
  manifest: ({ browser }) => ({
    // The store listing name tells it apart from an unrelated "Manga Shelf" add-on.
    name: forAmo ? 'mangashelf: Manga & CBZ Downloader' : 'mangashelf',
    description: 'Download manga chapters, galleries and images as folders, ZIP or CBZ.',
    permissions: [
      'activeTab',
      'scripting',
      'downloads',
      'storage',
      'contextMenus',
      'declarativeNetRequest',
      ...(browser === 'firefox' ? [] : ['offscreen']),
    ],
    // Asked for when the user turns on notifications in the settings.
    optional_permissions: ['notifications'],
    host_permissions: ['<all_urls>'],
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          id: 'mangashelf@eldinbegano',
          strict_min_version: '142.0',
          // Firefox/Floorp check this daily and install newer releases by themselves.
          ...(!forAmo && {
            update_url: 'https://github.com/EldinBegano/mangashelf/releases/latest/download/updates.json',
          }),
          data_collection_permissions: { required: ['none'] },
        },
      },
    }),
  }),
});
