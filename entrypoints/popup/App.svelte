<script lang="ts">
  import { onMount } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { browser } from 'wxt/browser';
  import type { ScanResult } from '@/lib/extractors';
  import { canRetry } from '@/lib/job-list';
  import { send, type Message } from '@/lib/messages';
  import { chapterLabel } from '@/lib/naming';
  import { cachedScan, carrySelection } from '@/lib/scan-cache';
  import { getSettings, saveSettings } from '@/lib/settings';
  import { checkForUpdate, type UpdateInfo } from '@/lib/update-check';
  import type { GalleryPage, JobProgress, MangadexQuality, SaveFormat } from '@/lib/types';

  let tabId = $state<number>();
  /** Private window: only private jobs are shown, and vice versa. */
  let incognito = false;
  let scan = $state<ScanResult>();
  let error = $state('');
  let loading = $state(true);
  /** A newer scan is on its way while a cached one is shown. */
  let refreshing = $state(false);
  let format = $state<SaveFormat>('folder');
  let quality = $state<MangadexQuality>('data');
  let minSize = $state(300);
  let jobs = $state<JobProgress[]>([]);
  let update = $state<UpdateInfo>();
  /** Loaded thumbnail sizes by page URL; a URL's image is the same in every scan. */
  let measured = $state<Record<string, { w: number; h: number }>>({});
  /** Index into thumbSources() by page URL; bumped when a thumbnail fails to load. */
  let thumbAttempt = $state<Record<string, number>>({});
  const selected = new SvelteSet<number>();
  let anchor: number | undefined;
  /** The user changed the selection since the scan on screen arrived. */
  let touched = false;
  /** Only the latest scan request may replace what is shown. */
  let latestScan = 0;

  const gallery = $derived(scan?.gallery);
  const isGeneric = $derived(gallery?.extractor === 'generic');
  const visible = $derived(
    (gallery?.pages ?? [])
      .map((page, index) => ({ page, index }))
      .filter(({ page, index }) => {
        if (!isGeneric) return true;
        const w = measured[page.url]?.w ?? page.width;
        const h = measured[page.url]?.h ?? page.height;
        return !((w !== undefined && w < minSize) || (h !== undefined && h < minSize));
      }),
  );
  const chosen = $derived(visible.filter(({ index }) => selected.has(index)).map(({ index }) => index));

  /** Put a scan on screen. A refresh of the one shown keeps what the user picked. */
  function show(result: ScanResult, refresh = false) {
    const picks = refresh && touched && gallery ? carrySelection(gallery, result.gallery, selected) : undefined;
    // Shift-click ranges start from an index, which means another page once the count changes.
    if (gallery?.pages.length !== result.gallery.pages.length) anchor = undefined;
    scan = result;
    selected.clear();
    for (const i of picks ?? result.gallery.preselect ?? result.gallery.pages.keys()) selected.add(i);
    if (!picks) touched = false;
  }

  /** Scan the tab. A refresh runs behind the scan already shown and keeps it if it fails. */
  async function rescan(autoScroll = false, refresh = false) {
    if (tabId === undefined) return;
    const id = ++latestScan;
    if (refresh) {
      refreshing = true;
    } else {
      loading = true;
      error = '';
    }
    try {
      const result = await send<ScanResult>({ type: 'scan', tabId, autoScroll, mangadexQuality: quality });
      if (id === latestScan) show(result, refresh);
    } catch (err) {
      if (id !== latestScan) return;
      if (refresh) {
        console.warn('[mangashelf] rescan failed, keeping the cached scan', err);
      } else {
        scan = undefined;
        error = err instanceof Error ? err.message : String(err);
      }
    } finally {
      if (id === latestScan) loading = refreshing = false;
    }
  }

  function toggle(index: number, event: MouseEvent) {
    touched = true;
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
    touched = true;
    for (const { index } of visible) on ? selected.add(index) : selected.delete(index);
  }

  function invert() {
    touched = true;
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

  async function jobAction(msg: Message) {
    try {
      await send(msg);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }

  async function showFile(downloadId: number) {
    try {
      await browser.downloads.show(downloadId);
    } catch {
      error = 'The file was moved or deleted.';
    }
  }

  function thumbSources(page: GalleryPage): string[] {
    return [...new Set([page.thumb, page.url, ...(page.fallbacks ?? [])].filter((u): u is string => !!u))];
  }

  function onThumbError(page: GalleryPage) {
    const next = (thumbAttempt[page.url] ?? 0) + 1;
    if (next < thumbSources(page).length) thumbAttempt[page.url] = next;
  }

  function onThumbLoad(page: GalleryPage, img: HTMLImageElement) {
    // Thumbnails of generic pages are the full images, so this is the real size.
    if (isGeneric && !page.thumb) measured[page.url] = { w: img.naturalWidth, h: img.naturalHeight };
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
      const options = { minSize: settings.minSize, mangadexQuality: quality };
      const [list, cached] = await Promise.all([
        send<JobProgress[]>({ type: 'jobs', incognito }).catch(() => []),
        tab?.id !== undefined && tab.url && !incognito ? cachedScan(tab.id, tab.url, options) : undefined,
      ]);
      jobs = list;
      if (cached) {
        show(cached.result);
        loading = false;
        if (!cached.fresh) await rescan(false, true);
      } else {
        await rescan();
      }
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
        {#if refreshing}<span class="refreshing"> · updating…</span>{/if}
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
                src={thumbSources(page)[thumbAttempt[page.url] ?? 0]}
                alt="Page {index + 1}"
                loading="lazy"
                decoding="async"
                onload={(e) => onThumbLoad(page, e.currentTarget as HTMLImageElement)}
                onerror={() => onThumbError(page)}
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
            <span class="job-status">
              {#if job.status === 'packing'}packing…{:else if job.status === 'error'}{job.error ?? 'failed'}{:else if job.status === 'cancelled'}cancelled{:else}{job.done}/{job.total}{/if}
            </span>
            {#if job.status === 'running' || job.status === 'packing'}
              <button class="mini" onclick={() => jobAction({ type: 'cancel', id: job.id })} title="Stop this download">Cancel</button>
            {/if}
            {#if canRetry(job)}
              <button class="mini" onclick={() => jobAction({ type: 'retry', id: job.id })} title="Download what failed again">Retry</button>
            {/if}
            {#if job.status === 'done' && job.downloadId !== undefined}
              <button class="mini" onclick={() => showFile(job.downloadId!)} title="Show in folder">Show</button>
            {/if}
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
    align-items: center;
    gap: 8px;
  }
  .job-label {
    flex: 1;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .mini {
    padding: 0 6px;
    font-size: 11px;
  }
  .job.error .job-status,
  .failed {
    color: var(--bad);
  }
  progress {
    width: 100%;
    accent-color: var(--accent);
  }
</style>
