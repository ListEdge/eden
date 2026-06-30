/**
 * Eden — Tool Registry.
 *
 * The catalogue of tools the Execution Plane may invoke. The Planner reads
 * descriptors to know what is available and at what permission level; the
 * Execution Plane resolves an adapter to actually run an action.
 *
 * Milestone 1 ships the interface and a loud stub. Concrete adapters (and the
 * credential wiring that lives only in the Execution Service) arrive in
 * Phase 3 (Build Spec §1.1, R15).
 */

import { NotImplementedError } from '@/lib/errors';
import type { ToolAdapter, ToolDescriptor } from '@/core/tool-registry/types';

export * from '@/core/tool-registry/types';

export interface ToolRegistry {
  /** Register an adapter, making its tool available to the Execution Plane. */
  register(adapter: ToolAdapter): void;
  /** Resolve a live adapter by tool name (Execution Plane only). */
  get(name: string): ToolAdapter;
  /** List catalogue descriptors (safe for the Planner; no credentials). */
  list(): ToolDescriptor[];
}

/** Placeholder Tool Registry for Milestone 1. */
export const toolRegistry: ToolRegistry = {
  register() {
    throw new NotImplementedError('ToolRegistry.register', 'Execution milestone (Phase 3)');
  },
  get() {
    throw new NotImplementedError('ToolRegistry.get', 'Execution milestone (Phase 3)');
  },
  list() {
    throw new NotImplementedError('ToolRegistry.list', 'Execution milestone (Phase 3)');
  },
};
