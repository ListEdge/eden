/**
 * Eden — Tool Registry.
 *
 * The catalogue of tools the Execution Plane may invoke. The Planner reads
 * descriptors to know what is available and at what permission level; the
 * Execution Plane resolves an adapter to actually run an action.
 *
 * Milestone 2 implements a real in-memory registry. Concrete adapters register
 * themselves at startup (see src/core/tools). The credential wiring inside each
 * adapter stays adapter-local (Build Spec §1.1, R15).
 */

import { NotFoundError } from '@/lib/errors';
import type { ToolAdapter, ToolDescriptor } from '@/core/tool-registry/types';

export * from '@/core/tool-registry/types';

export interface ToolRegistry {
  /** Register an adapter, making its tool available to the Execution Plane. */
  register(adapter: ToolAdapter): void;
  /** Resolve a live adapter by tool name (Execution Plane only). */
  get(name: string): ToolAdapter;
  /** Look up an adapter without throwing. */
  find(name: string): ToolAdapter | undefined;
  /** List catalogue descriptors (safe for the Planner; no credentials). */
  list(): ToolDescriptor[];
}

class InMemoryToolRegistry implements ToolRegistry {
  private adapters = new Map<string, ToolAdapter>();

  register(adapter: ToolAdapter): void {
    this.adapters.set(adapter.name, adapter);
  }

  get(name: string): ToolAdapter {
    const adapter = this.adapters.get(name);
    if (!adapter) {
      throw new NotFoundError(`Tool "${name}" is not registered`);
    }
    return adapter;
  }

  find(name: string): ToolAdapter | undefined {
    return this.adapters.get(name);
  }

  list(): ToolDescriptor[] {
    return [...this.adapters.values()].map((a) => ({
      name: a.name,
      permissionLevel: a.permissionLevel,
      reversible: a.reversible,
      supportsRollback: a.reversible,
      inputSchema: a.inputSchema,
      enabled: true,
    }));
  }
}

/** Process-wide registry instance. */
export const toolRegistry: ToolRegistry = new InMemoryToolRegistry();
