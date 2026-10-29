<script lang="ts">
  import { onMount } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { browser } from 'wxt/browser';
  import type { ScanResult } from '@/lib/extractors';
  import { send, type Message } from '@/lib/messages';
  import { chapterLabel } from '@/lib/naming';
  import { getSettings, saveSettings } from '@/lib/settings';
  import { checkForUpdate, type UpdateInfo } from '@/lib/update-check';
  import type { GalleryPage, JobProgress, MangadexQuality, SaveFormat } from '@/lib/types';

  let tabId = $state<number>();
  /** Private window: only private jobs are shown, and vice versa. */
  let incognito = false;
  let scan = $state<ScanResult>();
  let error = $state('');
  let loading = $state(true);
  let format = $state<SaveFormat>('folder');
  let quality = $state<MangadexQuality>('data');
  let minSize = $state(300);
  let jobs = $state<JobProgress[]>([]);
  let update = $state<UpdateInfo>();
  let measured = $state<Record<number, { w: number; h: number }>>({});
  /** Index into thumbSources() per page; bumped when a thumbnail fails to load. */
  let thumbAttempt = $state<Record<number, number>>({});
  const selected = new SvelteSet<number>();
  let anchor: number | undefined;

  const gallery = $derived(scan?.gallery);
  const isGeneric = $derived(gallery?.extractor === 'generic');
  const visible = $derived(
    (gallery?.pages ?? [])
      .map((page, index) => ({ page, index }))
      .filter(({ page, index }) => {
        if (!isGeneric) return true;
        const w = measured[index]?.w ?? page.width;
        const h = measured[index]?.h ?? page.height;
        return !((w !== undefined && w < minSize) || (h !== undefined && h < minSize));
      }),
  );
  const chosen = $derived(visible.filter(({ index }) => selected.has(index)).map(({ index }) => index));

  async function rescan(autoScroll = false) {
    if (tabId === undefined) return;
    loading = true;
    error = '';
    try {
      scan = await send<ScanResult>({ type: 'scan', tabId, autoScroll, mangadexQuality: quality });
      measured = {};
      thumbAttempt = {};
      selected.clear();
      for (const i of scan.gallery.preselect ?? scan.gallery.pages.keys()) selected.add(i);
    } catch (err) {
      scan = undefined;
      error = err instanceof Error ? err.message : String(err);
    } finally {
      loading = false;
    }
  }

  function toggle(index: number, event: MouseEvent) {
    if (event.shiftKey && anchor !== undefined) {
      const order = visible.map((v) => v.index);
      const [a, b] = [order.indexOf(anchor), order.indexOf(index)].sort((x, y) => x - y) as [number, number];
      const on = !selected.has(index);
      for (const i of order.slice(a, b + 1)) on ? selected.add(i) : selected.delete(i);
    } else {
      selected.has(index) ? selected.delete(index) : selected.add(index);
    }
    anchor = index;
  }

  function selectAll(on: boolean) {
    for (const { index } of visible) on ? selected.add(index) : selected.delete(index);
  }

  function invert() {
    for (const { index } of visible) selected.has(index) ? selected.delete(index) : selected.add(index);
  }

  async function download() {
    if (!gallery || tabId === undefined) return;
    try {
      await send({ type: 'download', gallery: $state.snapshot(gallery), pages: chosen, format, tabId });
      jobs = await send<JobProgress[]>({ type: 'jobs', incognito });
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }

  function thumbSources(page: GalleryPage): string[] {
    return [...new Set([page.thumb, page.url, ...(page.fallbacks ?? [])].filter((u): u is string => !!u))];
  }

  function onThumbError(index: number, page: GalleryPage) {
    const next = (thumbAttempt[index] ?? 0) + 1;
    if (next < thumbSources(page).length) thumbAttempt[index] = next;
  }

  function onThumbLoad(index: number, img: HTMLImageElement) {
    // Thumbnails of generic pages are the full images, so this is the real size.
    if (isGeneric && !gallery?.pages[index]?.thumb) {
      measured[index] = { w: img.naturalWidth, h: img.naturalHeight };
    }
  }

  onMount(() => {
    const onMessage = (msg: Message) => {
      if (msg?.type !== 'job:progress' || msg.progress.incognito !== incognito) return;
      const i = jobs.findIndex((j) => j.id === msg.progress.id);
      if (i >= 0) jobs[i] = msg.progress;
      else jobs = [msg.progress, ...jobs];
    };
    browser.runtime.onMessage.addListener(onMessage);

    // Firefox installs releases itself (update_url); other builds only get a notice.
    if (!import.meta.env.FIREFOX) {
      checkForUpdate(browser.runtime.getManifest().version).then((u) => (update = u));
    }

    (async () => {
      const settings = await getSettings();
      format = settings.format;
      quality = settings.mangadexQuality;
      minSize = settings.minSize;
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      tabId = tab?.id;
      incognito = tab?.incognito ?? false;
      jobs = await send<JobProgress[]>({ type: 'jobs', incognito }).catch(() => []);
      await rescan();
    })();

    return () => browser.runtime.onMessage.removeListener(onMessage);
  });
</script>

<main>
  <header>
    {#if gallery}
      <div class="site">{gallery.site}</div>
      <h1 title={gallery.series}>{gallery.series}</h1>
      <div class="meta">
        {#if chapterLabel(gallery)}<span>{chapterLabel(gallery)}</span> · {/if}
        <span>{gallery.pages.length} images</span>
      </div>
    {:else}
      <h1>mangashelf</h1>
    {/if}
    <button class="link" onclick={() => browser.runtime.openOptionsPage()} title="Settings">⚙</button>
  </header>

  {#if update}
    <a class="update" href={update.url} target="_blank" rel="noreferrer">mangashelf {update.version} is available. Download</a>
  {/if}
  {#if scan?.warning}<p class="warn">{scan.warning}</p>{/if}
  {#if error}<p class="error">{error}</p>{/if}

  {#if loading}
    <p class="status">Scanning page…</p>
  {:else if gallery}
    <div class="toolbar">
      <button onclick={() => selectAll(true)}>All</button>
      <button onclick={() => selectAll(false)}>None</button>
      <button onclick={invert}>Invert</button>
      <span class="count">{chosen.length} / {visible.length}</span>
    </div>
    {#if isGeneric}
      <div class="toolbar">
        <label>Min px <input type="number" min="0" step="50" bind:value={minSize} /></label>
        <button onclick={() => rescan(true)} title="Scroll the page to load lazy images, then rescan">Scroll &amp; rescan</button>
      </div>
    {/if}

    {#if visible.length === 0}
      <p class="status">No images found. Try “Scroll &amp; rescan” or a lower minimum size.</p>
    {:else}
      <ul class="grid">
        {#each visible as { page, index } (index)}
          <li>
            <button class="thumb" class:on={selected.has(index)} onclick={(e) => toggle(index, e)}>
              <img
                src={thumbSources(page)[thumbAttempt[index] ?? 0]}
                alt="Page {index + 1}"
                loading="lazy"
                onload={(e) => onThumbLoad(index, e.currentTarget as HTMLImageElement)}
                onerror={() => onThumbError(index, page)}
              />
              <span class="num">{index + 1}</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}

    <footer>
      <div class="segmented" role="radiogroup" aria-label="Save as">
        {#each ['folder', 'zip', 'cbz'] as const as f}
          <button class:on={format === f} role="radio" aria-checked={format === f} onclick={() => { format = f; saveSettings({ format: f }); }}>
            {f === 'folder' ? 'Folder' : f.toUpperCase()}
          </button>
        {/each}
      </div>
      {#if gallery.extractor === 'mangadex'}
        <select bind:value={quality} onchange={() => { saveSettings({ mangadexQuality: quality }); rescan(); }} title="MangaDex image quality">
          <option value="data">Original</option>
          <option value="data-saver">Data saver</option>
        </select>
      {/if}
      <button class="primary" disabled={chosen.length === 0} onclick={download}>Download {chosen.length}</button>
    </footer>
  {/if}

  {#if jobs.length}
    <section class="jobs">
      {#each jobs as job (job.id)}
        <div class="job" class:error={job.status === 'error'}>
          <div class="job-head">
            <span class="job-label" title={job.label}>{job.label}</span>
            <span>
              {#if job.status === 'packing'}packing…{:else if job.status === 'error'}{job.error ?? 'failed'}{:else}{job.done}/{job.total}{/if}
            </span>
          </div>
          <progress max={job.total} value={job.done + job.failed.length}></progress>
          {#if job.failed.length}
            <div class="failed">Failed pages: {job.failed.map((i) => i + 1).join(', ')}</div>
          {/if}
        </div>
      {/each}
    </section>
  {/if}
</main>

<style>
  main {
    width: 440px;
    max-height: 590px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
  }
  header {
    position: relative;
    padding-right: 28px;
  }
  .site {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--accent);
    font-weight: 600;
  }
  h1 {
    margin: 0;
    font-size: 15px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .meta,
  .status,
  .count {
    color: var(--muted);
  }
  .link {
    position: absolute;
    top: 0;
    right: 0;
    border: none;
    background: none;
    font-size: 16px;
  }
  .update {
    padding: 6px 8px;
    border-radius: 6px;
    background: var(--accent);
    color: var(--accent-fg);
    font-weight: 600;
    text-decoration: none;
  }
  .warn,
  .error {
    margin: 0;
    padding: 6px 8px;
    border-radius: 6px;
    background: var(--panel);
    border-left: 3px solid var(--bad);
  }
  .warn {
    border-left-color: #f59f00;
  }
  .toolbar {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .toolbar input {
    width: 70px;
  }
  .count {
    margin-left: auto;
  }
  .grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
    overflow-y: auto;
    min-height: 120px;
  }
  .thumb {
    position: relative;
    display: block;
    width: 100%;
    aspect-ratio: 2 / 3;
    padding: 0;
    overflow: hidden;
    border: 2px solid transparent;
    background: var(--panel);
    opacity: 0.45;
  }
  .thumb.on {
    border-color: var(--accent);
    opacity: 1;
  }
  .thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .num {
    position: absolute;
    left: 2px;
    bottom: 2px;
    padding: 0 4px;
    border-radius: 4px;
    font-size: 10px;
    background: rgb(0 0 0 / 0.6);
    color: #fff;
  }
  footer {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  footer .primary {
    margin-left: auto;
  }
  .segmented {
    display: inline-flex;
  }
  .segmented button {
    border-radius: 0;
  }
  .segmented button:first-child {
    border-radius: 6px 0 0 6px;
  }
  .segmented button:last-child {
    border-radius: 0 6px 6px 0;
  }
  .segmented button.on {
    background: var(--fg);
    color: var(--bg);
  }
  .jobs {
    display: flex;
    flex-direction: column;
    gap: 6px;
    border-top: 1px solid var(--line);
    padding-top: 8px;
    max-height: 160px;
    overflow-y: auto;
  }
  .job-head {
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }
  .job-label {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .job.error .job-head span:last-child,
  .failed {
    color: var(--bad);
  }
  progress {
    width: 100%;
    accent-color: var(--accent);
  }
</style>
