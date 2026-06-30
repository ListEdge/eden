/**
 * Eden — Core barrel.
 *
 * The Eden core is organised as one module per responsibility, each mapped to a
 * plane of the architecture (Core Contract §1):
 *
 *   Reasoning Plane   →  reasoning              (decide what + why; no side effects)
 *   Execution Plane   →  execution, tool-registry (act on approved packages; holds creds)
 *   Memory Plane      →  memory, audit          (single source of truth; append-only)
 *   Control / spine   →  orchestrator, work-package, approval
 *
 * The Work Package (`work-package`) is the only object that crosses plane
 * boundaries. The Orchestrator is the only writer of status. The Memory API is
 * the only path to persisted state.
 *
 * Milestone 1 provides the interfaces above plus the pure foundation helpers
 * (state-machine legality, invariant checks, scope fingerprint); behavioural
 * implementations arrive in later milestones (see docs/MILESTONES.md).
 *
 * Modules are namespaced on re-export to avoid name collisions between the
 * many `*Input`/`types` exports; import a module's barrel directly for its full
 * surface (e.g. `import { workPackageSchema } from '@/core/work-package'`).
 */

export * as workPackage from '@/core/work-package';
export * as reasoning from '@/core/reasoning';
export * as execution from '@/core/execution';
export * as toolRegistry from '@/core/tool-registry';
export * as approval from '@/core/approval';
export * as orchestrator from '@/core/orchestrator';
export * as memory from '@/core/memory';
export * as audit from '@/core/audit';
