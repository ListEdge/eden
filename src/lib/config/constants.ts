/**
 * Eden — Application constants.
 *
 * Client-safe metadata (no secrets, no package.json import). The authoritative
 * npm package version is reported by `/api/version` (server-only). `EDEN_VERSION`
 * here is the human-facing foundation/release label shown in the UI; keep it in
 * sync with package.json on release.
 */

export const APP_NAME = 'Eden';
export const APP_TAGLINE = 'An execution-first AI operating system';
export const EDEN_VERSION = '0.1.0';

/** Version of the HTTP API contract (the response envelope + route shapes). */
export const API_VERSION = '2026-06-01';

/** The three strictly-separated planes of the architecture (Core Contract §1). */
export const PLANES = [
  {
    id: 'reasoning',
    name: 'Reasoning Plane',
    responsibility: 'Cognition. Understands intent, produces specs and plans.',
    boundary: 'Never touches the outside world or invokes side-effecting tools.',
  },
  {
    id: 'execution',
    name: 'Execution Plane',
    responsibility: 'Action. Runs approved Work Packages against tools/systems.',
    boundary: 'Never decides, re-plans, or improvises. Holds all tool credentials.',
  },
  {
    id: 'memory',
    name: 'Memory Plane',
    responsibility: 'Persistent state. The single source of truth.',
    boundary: 'Append-only and explainable. Never silently overwritten.',
  },
] as const;

/** Foundation modules scaffolded in Milestone 1 (interfaces + stubs). */
export const MODULES = [
  { id: 'orchestrator', plane: 'control', name: 'Orchestrator' },
  { id: 'reasoning', plane: 'reasoning', name: 'Reasoning Plane' },
  { id: 'work-package', plane: 'control', name: 'Work Package Engine' },
  { id: 'execution', plane: 'execution', name: 'Execution Engine' },
  { id: 'tool-registry', plane: 'execution', name: 'Tool Registry' },
  { id: 'approval', plane: 'control', name: 'Approval System' },
  { id: 'memory', plane: 'memory', name: 'Memory System' },
  { id: 'audit', plane: 'memory', name: 'Audit / Event Log' },
] as const;

/** Permission levels (Core Contract §3). The classifier assigns the minimum sufficient level. */
export const PERMISSION_LEVELS = {
  1: { label: 'READ_ONLY', summary: 'Analyse · Explain · Suggest', approval: 'none' },
  2: { label: 'PREPARE', summary: 'Plan · Draft · Design · Stage', approval: 'none' },
  3: { label: 'EXECUTE', summary: 'Apply · Deploy · Send · Mutate', approval: 'per-package, explicit' },
} as const;

export type PlaneId = (typeof PLANES)[number]['id'];
export type ModuleId = (typeof MODULES)[number]['id'];

/**
 * Pre-auth system identity. Until authentication and tenancy land, server-side
 * intake runs as this fixed tenant + principal, which are seeded by
 * supabase/migrations/0002. These IDs MUST match that migration exactly. They
 * are not secrets, and they go away when real auth arrives.
 */
export const SYSTEM_TENANT_ID = '00000000-0000-4000-8000-000000000001';
export const SYSTEM_PRINCIPAL_ID = '00000000-0000-4000-8000-000000000002';
