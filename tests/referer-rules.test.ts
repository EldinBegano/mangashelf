import { describe, expect, it, vi } from 'vitest';
import type { Gallery } from '../lib/types';

type Rule = { id: number; condition: { requestDomains?: string[] } };

// Like the real API: reads are async, and adding a rule id that exists throws.
const rules: Rule[] = [];
const declarativeNetRequest = {
  getSessionRules: async () => {
    const snapshot = [...rules];
    await new Promise((r) => setTimeout(r, 5));
    return snapshot;
  },
  updateSessionRules: async ({ addRules = [], removeRuleIds = [] }: { addRules?: Rule[]; removeRuleIds?: number[] }) => {
    for (const id of removeRuleIds) rules.splice(rules.findIndex((r) => r.id === id), 1);
    for (const rule of addRules) {
      if (rules.some((r) => r.id === rule.id)) throw new Error(`Rule with id ${rule.id} does not have a unique ID.`);
      rules.push(rule);
    }
  },
};
vi.mock('wxt/browser', () => ({ browser: { declarativeNetRequest } }));

const { ensureRefererRules } = await import('../lib/referer-rules');

const gallery = (host: string): Gallery => ({
  extractor: 'generic',
  site: host,
  series: 'x',
  sourceUrl: `https://${host}/read`,
  referer: `https://${host}/read`,
  pages: [{ url: `https://img.${host}/1.jpg` }],
});

describe('ensureRefererRules', () => {
  it('gives concurrent calls distinct rule ids', async () => {
    await Promise.all([ensureRefererRules(gallery('a.example')), ensureRefererRules(gallery('b.example'))]);
    expect(rules.map((r) => r.condition.requestDomains?.[0]).sort()).toEqual(['img.a.example', 'img.b.example']);
    expect(new Set(rules.map((r) => r.id)).size).toBe(2);
  });
});
