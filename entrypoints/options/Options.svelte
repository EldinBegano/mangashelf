<script lang="ts">
  import { onMount } from 'svelte';
  import { folderPath, pageNames } from '@/lib/naming';
  import { DEFAULT_SETTINGS, getSettings, saveSettings } from '@/lib/settings';
  import type { Gallery, Settings } from '@/lib/types';

  let settings = $state<Settings>({ ...DEFAULT_SETTINGS });
  let saved = $state(false);

  const example: Gallery = {
    extractor: 'mangadex',
    site: 'mangadex',
    series: 'Lost Man',
    volume: '13',
    chapter: '123',
    title: 'The Good Old Days...',
    sourceUrl: 'https://mangadex.org/chapter/…',
    pages: [],
  };
  const preview = $derived(`${folderPath(settings.baseFolder, settings.folderTemplate, example)}/${pageNames(19)[0]}.jpg`);

  onMount(async () => {
    settings = await getSettings();
  });

  async function save() {
    settings.concurrency = Math.min(8, Math.max(1, Math.round(settings.concurrency)));
    settings = await saveSettings($state.snapshot(settings));
    saved = true;
    setTimeout(() => (saved = false), 1500);
  }
</script>

<main>
  <h1>mangashelf settings</h1>

  <label>
    <span>Base folder <small>inside your Downloads folder</small></span>
    <input type="text" bind:value={settings.baseFolder} />
  </label>

  <label>
    <span>Folder template <small><code>{'{site}'}</code> <code>{'{series}'}</code> <code>{'{chapter}'}</code> <code>{'{title}'}</code></small></span>
    <input type="text" bind:value={settings.folderTemplate} />
  </label>
  <p class="preview">Example: <code>{preview}</code></p>

  <label>
    <span>Default format</span>
    <select bind:value={settings.format}>
      <option value="folder">Folder of images</option>
      <option value="zip">ZIP</option>
      <option value="cbz">CBZ (with ComicInfo.xml)</option>
    </select>
  </label>

  <label>
    <span>Parallel downloads <small>1–8</small></span>
    <input type="number" min="1" max="8" bind:value={settings.concurrency} />
  </label>

  <label>
    <span>Minimum image size <small>px, generic pages only</small></span>
    <input type="number" min="0" step="50" bind:value={settings.minSize} />
  </label>

  <label>
    <span>MangaDex quality</span>
    <select bind:value={settings.mangadexQuality}>
      <option value="data">Original</option>
      <option value="data-saver">Data saver</option>
    </select>
  </label>

  <div class="actions">
    <button class="primary" onclick={save}>Save</button>
    <button onclick={() => (settings = { ...DEFAULT_SETTINGS })}>Reset to defaults</button>
    {#if saved}<span class="saved">Saved</span>{/if}
  </div>
</main>

<style>
  main {
    max-width: 560px;
    margin: 32px auto;
    padding: 0 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  h1 {
    font-size: 20px;
    margin: 0 0 4px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  small {
    color: var(--muted);
    font-weight: normal;
    margin-left: 4px;
  }
  span {
    font-weight: 600;
  }
  .preview {
    margin: -8px 0 0;
    color: var(--muted);
    word-break: break-all;
  }
  .actions {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .saved {
    color: var(--ok);
  }
</style>
