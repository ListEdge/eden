/**
 * Eden — Tavily web-search provider.
 *
 * Tavily is a search API built for AI agents: one POST returns clean, ranked
 * results plus an optional synthesised answer. Parsing is defensive — it reads
 * only the fields it needs and tolerates anything missing.
 *
 * Network note: this runs on the server and calls api.tavily.com.
 */

import { getSearchConfig } from '@/lib/config/env';
import type {
  WebSearchQuery,
  WebSearchProvider,
  WebSearchResponse,
  WebSearchResult,
} from '@/lib/search/types';

const SEARCH_URL = 'https://api.tavily.com/search';

function asString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}
function asNullableNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export const tavilyProvider: WebSearchProvider = {
  id: 'tavily',

  async search(query: WebSearchQuery): Promise<WebSearchResponse> {
    const { apiKey } = getSearchConfig();
    const limit = Math.min(Math.max(query.limit ?? 5, 1), 10);

    const res = await fetch(SEARCH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query: query.query,
        search_depth: 'basic',
        include_answer: true,
        max_results: limit,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Tavily request failed (HTTP ${res.status}): ${body.slice(0, 200)}`);
    }

    const data: unknown = await res.json();
    const root = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;

    const rawResults = Array.isArray(root.results) ? root.results : [];
    const results: WebSearchResult[] = rawResults
      .map((r): WebSearchResult | null => {
        const item = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>;
        const url = asString(item.url);
        if (!url) return null;
        return {
          title: asString(item.title) || url,
          url,
          snippet: asString(item.content).slice(0, 500),
          score: asNullableNumber(item.score),
        };
      })
      .filter((x): x is WebSearchResult => x !== null);

    const answerRaw = asString(root.answer).trim();
    return { answer: answerRaw ? answerRaw : null, results };
  },
};
