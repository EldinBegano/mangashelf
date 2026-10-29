import { defineConfig } from 'wxt';

// Chrome builds MV3 (service worker + offscreen document for long jobs).
// Firefox builds MV2 (WXT default) so the background page can stay persistent
// and run download jobs itself.
export default defineConfig({
  modules: ['@wxt-dev/module-svelte'],
  manifest: ({ browser }) => ({
    name: 'mangashelf',
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
    host_permissions: ['<all_urls>'],
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          id: 'mangashelf@eldinbegano',
          strict_min_version: '142.0',
          data_collection_permissions: { required: ['none'] },
        },
      },
    }),
  }),
});
