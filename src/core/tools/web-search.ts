/**
 * Eden — `web.search` tool.
 *
 * A read-only (Level 1) Execution tool: search the live web for information.
 * It changes nothing in the world, so rollback is a no-op. It delegates to the
 * configured web-search provider (Tavily by default) and decides nothing itself
 * (Core Contract Rule 2).
 */

import { z } from 'zod';
import type { ToolAdapter } from '@/core/tool-registry/types';
import type { ToolResult } from '@/core/execution/types';
import { getWebSearchProvider } from '@/lib/search';

export const WEB_SEARCH_TOOL = 'web.search';

const inputSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().positive().max(10).optional(),
});

export const webSearchTool: ToolAdapter = {
  name: WEB_SEARCH_TOOL,
  permissionLevel: 1,
  reversible: true,
  inputSchema: {
    type: 'object',
    required: ['query'],
    properties: {
      query: { type: 'string', description: 'The search query' },
      limit: { type: 'number', description: 'Max number of source results' },
    },
  },

  async run(inputs: unknown): Promise<ToolResult> {
    const parsed = inputSchema.safeParse(inputs);
    if (!parsed.success) {
      return {
        ok: false,
        error: {
          message: 'Invalid inputs for web.search',
          details: { issues: parsed.error.issues.map((i) => i.message) },
        },
      };
    }
    try {
      const provider = getWebSearchProvider();
      const response = await provider.search(parsed.data);
      return {
        ok: true,
        output: { answer: response.answer, results: response.results, count: response.results.length },
        meta: { provider: provider.id },
      };
    } catch (error) {
      return {
        ok: false,
        error: { message: error instanceof Error ? error.message : 'Web search failed' },
      };
    }
  },

  // Read-only: nothing to undo.
  async rollback(): Promise<ToolResult> {
    return { ok: true };
  },
};
