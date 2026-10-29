import { browser } from 'wxt/browser';
import type { Settings } from './types';

export const DEFAULT_SETTINGS: Settings = {
  baseFolder: 'mangashelf',
  folderTemplate: '{site}/{series}/{chapter}',
  format: 'folder',
  concurrency: 3,
  minSize: 300,
  mangadexQuality: 'data',
};

export async function getSettings(): Promise<Settings> {
  const { settings } = await browser.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...(settings as Partial<Settings> | undefined) };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await browser.storage.local.set({ settings: next });
  return next;
}
