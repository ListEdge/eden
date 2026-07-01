/**
 * Eden — `weather.current` tool.
 *
 * A read-only (Level 1) Execution tool: fetch current weather for a location.
 * It changes nothing in the world, so rollback is a no-op. It delegates to the
 * Open-Meteo weather module (no API key) and decides nothing itself.
 */

import { z } from 'zod';
import type { ToolAdapter } from '@/core/tool-registry/types';
import type { ToolResult } from '@/core/execution/types';
import { getWeather } from '@/lib/weather';

export const WEATHER_TOOL = 'weather.current';

const inputSchema = z.object({
  location: z.string().min(1),
});

export const weatherTool: ToolAdapter = {
  name: WEATHER_TOOL,
  permissionLevel: 1,
  reversible: true,
  inputSchema: {
    type: 'object',
    required: ['location'],
    properties: {
      location: { type: 'string', description: 'Free-text place, e.g. a city name' },
    },
  },

  async run(inputs: unknown): Promise<ToolResult> {
    const parsed = inputSchema.safeParse(inputs);
    if (!parsed.success) {
      return {
        ok: false,
        error: {
          message: 'Invalid inputs for weather.current',
          details: { issues: parsed.error.issues.map((i) => i.message) },
        },
      };
    }
    try {
      const weather = await getWeather(parsed.data.location);
      return {
        ok: true,
        output: { weather },
        meta: { location: weather.locationLabel },
      };
    } catch (error) {
      return {
        ok: false,
        error: { message: error instanceof Error ? error.message : 'Weather lookup failed' },
      };
    }
  },

  // Read-only: nothing to undo.
  async rollback(): Promise<ToolResult> {
    return { ok: true };
  },
};
