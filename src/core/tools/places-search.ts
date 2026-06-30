/**
 * Eden — `places.search` tool.
 *
 * The Execution Plane's first real tool: find places (restaurants) near a
 * location. It is read-only (Level 1) and reversible by definition — it changes
 * nothing in the world — so its rollback is a no-op. It delegates to the
 * configured place-search provider (Geoapify by default) and never decides
 * anything itself (Core Contract Rule 2).
 */

import { z } from 'zod';
import type { ToolAdapter } from '@/core/tool-registry/types';
import type { ToolResult } from '@/core/execution/types';
import { getPlaceSearchProvider } from '@/lib/places';

export const PLACES_SEARCH_TOOL = 'places.search';

const inputSchema = z.object({
  location: z.string().min(1),
  cuisine: z.string().nullish(),
  radiusMeters: z.number().int().positive().max(50000).optional(),
  limit: z.number().int().positive().max(20).optional(),
});

export const placesSearchTool: ToolAdapter = {
  name: PLACES_SEARCH_TOOL,
  permissionLevel: 1,
  reversible: true,
  inputSchema: {
    type: 'object',
    required: ['location'],
    properties: {
      location: { type: 'string', description: 'Free-text area to search near' },
      cuisine: { type: 'string', description: 'Optional cuisine, e.g. italian' },
      radiusMeters: { type: 'number', description: 'Search radius in metres' },
      limit: { type: 'number', description: 'Max number of results' },
    },
  },

  async run(inputs: unknown): Promise<ToolResult> {
    const parsed = inputSchema.safeParse(inputs);
    if (!parsed.success) {
      return {
        ok: false,
        error: {
          message: 'Invalid inputs for places.search',
          details: { issues: parsed.error.issues.map((i) => i.message) },
        },
      };
    }
    try {
      const provider = getPlaceSearchProvider();
      const results = await provider.search(parsed.data);
      return {
        ok: true,
        output: { results, count: results.length },
        meta: { provider: provider.id, location: parsed.data.location },
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          message: error instanceof Error ? error.message : 'Place search failed',
        },
      };
    }
  },

  // Read-only: nothing to undo.
  async rollback(): Promise<ToolResult> {
    return { ok: true };
  },
};
