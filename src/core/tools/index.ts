/**
 * Eden — built-in tools.
 *
 * Registers the tools Eden ships with into the Tool Registry. `ensureToolsRegistered`
 * is idempotent and is called by the Orchestrator before it resolves any tool,
 * so registration happens regardless of module load order.
 */

import { toolRegistry } from '@/core/tool-registry';
import { placesSearchTool, PLACES_SEARCH_TOOL } from '@/core/tools/places-search';

export { PLACES_SEARCH_TOOL } from '@/core/tools/places-search';

let registered = false;

export function ensureToolsRegistered(): void {
  if (registered) return;
  toolRegistry.register(placesSearchTool);
  registered = true;
}

export const BUILT_IN_TOOL_NAMES = [PLACES_SEARCH_TOOL] as const;
