/**
 * Eden — Tool Registry types.
 *
 * A tool is the Execution Plane's bridge to one external capability (e.g.
 * `vercel.deploy`, `supabase.migrate`). Every tool is described by its
 * permission level, reversibility, and an input schema, and is invoked only
 * through its adapter — which is the sole component holding that tool's
 * credentials (Core Contract §1, Build Spec R7/R15).
 */

import type { ToolResult } from '@/core/execution/types';
import type { PermissionLevel } from '@/core/work-package/types';

/**
 * JSON Schema describing a tool's accepted inputs. Kept as an opaque record at
 * this layer; the registry/adapters validate against it. (A stricter type
 * arrives with the validation milestone.)
 */
export type JSONSchema = Record<string, unknown>;

/**
 * Runtime adapter for a single tool. The `run`/`rollback` methods are the only
 * place credentials are used, and they live exclusively in the Execution
 * Service (Build Spec §1.1).
 */
export interface ToolAdapter {
  readonly name: string;
  readonly permissionLevel: PermissionLevel;
  readonly reversible: boolean;
  readonly inputSchema: JSONSchema;
  /** Execute the tool. `idempotencyKey` makes re-issued calls safe (R2). */
  run(inputs: unknown, idempotencyKey: string): Promise<ToolResult>;
  /** Undo a prior run. Required when `reversible` is true (Contract Rule 6). */
  rollback(inputs: unknown): Promise<ToolResult>;
}

/**
 * Catalogue metadata for a tool, independent of its live adapter. Mirrors the
 * `tools` table (Build Spec §3). `enabled: false` routes a package needing it
 * to `BLOCKED_ON_TOOL` rather than failing (Contract §6.4).
 */
export interface ToolDescriptor {
  name: string;
  permissionLevel: PermissionLevel;
  reversible: boolean;
  supportsRollback: boolean;
  inputSchema: JSONSchema;
  enabled: boolean;
}
