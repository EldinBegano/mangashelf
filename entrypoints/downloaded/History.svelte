<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from 'wxt/browser';
  import {
    clearHistory,
    deleteEntries,
    exportHistory,
    groupBySeries,
    importHistory,
    listHistory,
    type HistoryEntry,
  } from '@/lib/history';

  let entries = $state<HistoryEntry[]>([]);
  let loaded = $state(false);
  let query = $state('');
  let message = $state('');
  let error = $state('');
  /** "Clear all" asks once more before deleting. */
  let confirmClear = $state(false);
  let fileInput: HTMLInputElement;

  const groups = $derived(groupBySeries(entries, query));
  const shown = $derived(groups.reduce((n, g) => n + g.chapters.length, 0));

  const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

  async function load() {
    try {
      entries = await listHistory();
    } catch (err) {
      error = `Could not open the history: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      loaded = true;
    }
  }

  async function run(action: () => Promise<unknown>) {
    error = message = '';
    try {
      await action();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }

  const remove = (keys: string[]) =>
    run(async () => {
      await deleteEntries(keys);
      const gone = new Set(keys);
      entries = entries.filter((e) => !gone.has(e.key));
    });

  const clearAll = () =>
    run(async () => {
      await clearHistory();
      entries = [];
      confirmClear = false;
    });

  const exportFile = () =>
    run(async () => {
      const data = await exportHistory();
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `mangashelf-history-${data.exportedAt.slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    });

  const importFile = (file: File) =>
    run(async () => {
      let data: unknown;
      try {
        data = JSON.parse(await file.text());
      } catch {
        throw new Error(`${file.name} is not a JSON file`);
      }
      const changed = await importHistory(data);
      await load();
      message = changed ? `Imported ${changed} chapter${changed === 1 ? '' : 's'}.` : 'Nothing new to import.';
    });

  const show = (downloadId: number) =>
    run(async () => {
      try {
        await browser.downloads.show(downloadId);
      } catch {
        throw new Error('The browser no longer knows this download. The file may still be in your Downloads folder.');
      }
    });

  onMount(load);
</script>

<main>
  <header>
    <h1>Download history</h1>
    <div class="actions">
      <button onclick={exportFile} disabled={!entries.length}>Export</button>
      <button onclick={() => fileInput.click()}>Import</button>
      <input
        bind:this={fileInput}
        type="file"
        accept="application/json,.json"
        hidden
        onchange={(e) => {
          const input = e.currentTarget as HTMLInputElement;
          const file = input.files?.[0];
          input.value = '';
          if (file) importFile(file);
        }}
      />
      {#if confirmClear}
        <button class="danger" onclick={clearAll}>Delete all history</button>
        <button onclick={() => (confirmClear = false)}>Keep it</button>
      {:else}
        <button onclick={() => (confirmClear = true)} disabled={!entries.length}>Clear all</button>
      {/if}
    </div>
  </header>
  <p class="note">Removing entries here doesn't touch the downloaded files. Downloads from private windows are never recorded.</p>

  {#if error}<p class="error">{error}</p>{/if}
  {#if message}<p class="message">{message}</p>{/if}

  {#if !loaded}
    <p class="muted">Loading…</p>
  {:else if !entries.length}
    <p class="muted">Nothing downloaded yet. Finished downloads show up here.</p>
  {:else}
    <input class="search" type="search" placeholder="Search series, site or chapter" bind:value={query} />
    <p class="muted">
      {shown} chapter{shown === 1 ? '' : 's'} in {groups.length} series{query && ` matching “${query}”`}
    </p>

    {#each groups as group (group.seriesKey)}
      <section>
        <div class="series-head">
          <h2 title={group.series}>{group.series}</h2>
          <span class="site">{group.site}</span>
          <button
            class="mini"
            onclick={() => remove(group.chapters.map((c) => c.key))}
            title="Remove this series from the history">Remove</button
          >
        </div>
        <ul>
          {#each group.chapters as entry (entry.key)}
            <li>
              <a class="label" href={entry.sourceUrl} target="_blank" rel="noreferrer" title={entry.path}
                >{entry.label || entry.path.split('/').pop()}</a
              >
              <span class="muted">
                {entry.format === 'folder' ? 'Folder' : entry.format.toUpperCase()} ·
                {entry.total - entry.failed.length}/{entry.total} pages · {dateFormat.format(entry.downloadedAt)}
              </span>
              {#if entry.failed.length}
                <span class="bad" title="Failed pages: {entry.failed.map((i) => i + 1).join(', ')}">
                  {entry.failed.length} failed
                </span>
              {/if}
              <span class="row-actions">
                {#if entry.downloadId !== undefined}
                  <button class="mini" onclick={() => show(entry.downloadId!)} title="Show in folder">Show</button>
                {/if}
                <button class="mini" onclick={() => remove([entry.key])} title="Remove from the history">×</button>
              </span>
            </li>
          {/each}
        </ul>
      </section>
    {/each}
  {/if}
</main>

<style>
  main {
    max-width: 760px;
    margin: 32px auto;
    padding: 0 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  h1 {
    font-size: 20px;
    margin: 0;
    margin-right: auto;
  }
  .actions,
  .row-actions {
    display: flex;
    gap: 6px;
  }
  .note,
  .muted {
    margin: 0;
    color: var(--muted);
  }
  .error,
  .message {
    margin: 0;
    padding: 6px 8px;
    border-radius: 6px;
    background: var(--panel);
    border-left: 3px solid var(--bad);
  }
  .message {
    border-left-color: var(--ok);
  }
  .search {
    width: 100%;
    border: 1px solid var(--line);
    background: var(--bg);
    border-radius: 6px;
    padding: 6px 8px;
  }
  section {
    border-top: 1px solid var(--line);
    padding-top: 8px;
  }
  .series-head {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }
  h2 {
    margin: 0;
    font-size: 15px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .site {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--accent);
    font-weight: 600;
    margin-right: auto;
  }
  ul {
    list-style: none;
    margin: 6px 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 10px;
  }
  .label {
    color: inherit;
    font-weight: 600;
  }
  .row-actions {
    margin-left: auto;
  }
  .bad {
    color: var(--bad);
  }
  .mini {
    padding: 0 6px;
    font-size: 11px;
  }
  .danger {
    background: var(--bad);
    border-color: var(--bad);
    color: #fff;
  }
</style>
