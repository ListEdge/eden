/**
 * Eden — Work Package validation, invariants, and scope fingerprint.
 *
 * Three responsibilities, all pure (no I/O):
 *   1. A zod schema mirroring the Core Contract §4 object, so any Work Package
 *      crossing a boundary (API body, Memory read, Reasoning output) can be
 *      structurally validated.
 *   2. The Contract §4 invariant checks ("MUST hold"). These are app-level
 *      defence; the database enforces the same rules as the last line
 *      (Build Spec §3.1).
 *   3. `computeScopeFingerprint` — the sha256 over approval-relevant fields that
 *      binds an approval to an exact package (Build Spec Risk R3). Re-planning
 *      changes the fingerprint and therefore auto-voids a prior approval
 *      (Contract Rule 11).
 *
 * Runtime note: the fingerprint uses `node:crypto`, so any caller runs on the
 * Node.js runtime, not the Edge runtime. Keep this module server-side.
 */

import { createHash } from 'node:crypto';
import { z } from 'zod';
import { InvariantViolationError } from '@/lib/errors';
import type {
  PermissionLevel,
  WorkPackage,
  WpStatus,
} from '@/core/work-package/types';

const permissionLevel = z.union([z.literal(1), z.literal(2), z.literal(3)]);

const wpStatus: z.ZodType<WpStatus> = z.enum([
  'RECEIVED',
  'SPECIFIED',
  'PLANNED',
  'AWAITING_APPROVAL',
  'APPROVED',
  'EXECUTING',
  'VERIFYING',
  'COMPLETED',
  'BLOCKED_ON_INPUT',
  'BLOCKED_ON_TOOL',
  'FAILED',
  'ROLLED_BACK',
  'ROLLBACK_FAILED',
  'CANCELLED',
]);

const actionStatus = z.enum([
  'PENDING',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  'SKIPPED',
  'ROLLED_BACK',
]);

const actionType = z.enum(['read', 'transform', 'stage', 'tool_call']);

const intentSchema = z.object({
  raw_request: z.string(),
  interpreted_goal: z.string(),
  out_of_scope: z.array(z.string()),
});

const specSchema = z.object({
  constraints: z.array(z.string()),
  assumptions: z.array(z.string()),
  inputs_required: z.array(z.string()),
  acceptance_criteria: z.array(z.string()),
});

const approvalSchema = z.object({
  required: z.boolean(),
  granted: z.boolean(),
  approved_by: z.string().nullable(),
  approval_token: z.string().nullable(),
  approved_at: z.string().nullable(),
});

const planStepSchema = z.object({
  step: z.number().int(),
  description: z.string(),
  produces: z.array(z.string()),
});

const planSchema = z.object({
  summary: z.string(),
  reasoning_ref: z.string(),
  steps: z.array(planStepSchema),
});

const actionSchema = z.object({
  action_id: z.string(),
  type: actionType,
  tool: z.string().nullable(),
  inputs: z.record(z.string(), z.unknown()),
  permission_level: permissionLevel,
  reversible: z.boolean(),
  rollback_action_id: z.string().nullable(),
  status: actionStatus,
  log_ref: z.string().nullable(),
  depends_on: z.array(z.string()),
});

const outputSchema = z.object({
  output_id: z.string(),
  produced_by: z.string(),
  type: z.string(),
  value: z.unknown().nullable(),
  verified: z.boolean(),
});

const dependenciesSchema = z.object({
  depends_on_packages: z.array(z.string()),
  blocks_packages: z.array(z.string()),
  external: z.array(z.string()),
});

const rollbackStepSchema = z.object({
  rollback_id: z.string(),
  undoes: z.string(),
  method: z.string(),
});

const rollbackPlanSchema = z.object({
  strategy: z.string(),
  irreversible_actions: z.array(z.string()),
  steps: z.array(rollbackStepSchema),
  irreversible_acknowledged: z.boolean(),
});

const statusHistoryEntrySchema = z.object({
  status: wpStatus,
  at: z.string(),
});

/** Structural schema for a complete Work Package (Core Contract §4). */
export const workPackageSchema: z.ZodType<WorkPackage> = z.object({
  id: z.string(),
  version: z.number().int().positive(),
  created_at: z.string(),
  updated_at: z.string(),
  intent: intentSchema,
  spec: specSchema,
  permission_level_required: permissionLevel,
  approval: approvalSchema,
  plan: planSchema.nullable(),
  actions: z.array(actionSchema),
  outputs: z.array(outputSchema),
  dependencies: dependenciesSchema,
  rollback_plan: rollbackPlanSchema,
  status: wpStatus,
  status_history: z.array(statusHistoryEntrySchema),
});

/** A single invariant breach. */
export interface InvariantIssue {
  rule: string;
  message: string;
}

/**
 * Check the Core Contract §4 invariants. Returns every breach found (does not
 * throw), so a caller can surface them together. Use `assertInvariants` when a
 * breach should halt forward motion (Contract Rule 12).
 */
export function validateInvariants(wp: WorkPackage): InvariantIssue[] {
  const issues: InvariantIssue[] = [];
  const actionIds = new Set(wp.actions.map((a) => a.action_id));

  // Every irreversible action must be declared and (before approval) acknowledged.
  const declaredIrreversible = new Set(wp.rollback_plan.irreversible_actions);
  for (const action of wp.actions) {
    if (!action.reversible && !declaredIrreversible.has(action.action_id)) {
      issues.push({
        rule: 'Contract §4 / Rule 6',
        message: `Irreversible action ${action.action_id} is not listed in rollback_plan.irreversible_actions`,
      });
    }
  }
  if (declaredIrreversible.size > 0 && !wp.rollback_plan.irreversible_acknowledged) {
    // Only a hard blocker once we are at/after approval; flagged at all stages.
    issues.push({
      rule: 'Contract §4 / Rule 6',
      message: 'Irreversible actions present but irreversible_acknowledged is false',
    });
  }

  // Every output must trace to a real action.
  for (const output of wp.outputs) {
    if (!actionIds.has(output.produced_by)) {
      issues.push({
        rule: 'Contract §4',
        message: `Output ${output.output_id} references unknown action ${output.produced_by}`,
      });
    }
  }

  // Action dependencies must reference real actions (precondition for the DAG check).
  for (const action of wp.actions) {
    for (const dep of action.depends_on) {
      if (!actionIds.has(dep)) {
        issues.push({
          rule: 'Build Spec R12',
          message: `Action ${action.action_id} depends on unknown action ${dep}`,
        });
      }
    }
  }

  // The action dependency graph must be acyclic (Build Spec R12).
  if (hasDependencyCycle(wp)) {
    issues.push({
      rule: 'Build Spec R12',
      message: 'Action dependency graph contains a cycle',
    });
  }

  // A package may not be EXECUTING without satisfied approval (Contract Rule 1).
  if (wp.status === 'EXECUTING' && wp.approval.required && !wp.approval.granted) {
    issues.push({
      rule: 'Contract §4 / Rule 1',
      message: 'Work Package is EXECUTING but required approval has not been granted',
    });
  }

  return issues;
}

/** Throw `InvariantViolationError` if any Contract §4 invariant is breached. */
export function assertInvariants(wp: WorkPackage): void {
  const issues = validateInvariants(wp);
  if (issues.length > 0) {
    throw new InvariantViolationError('Work Package violates one or more invariants', {
      issues,
    });
  }
}

/** Detect a cycle in the action dependency DAG via DFS. */
function hasDependencyCycle(wp: WorkPackage): boolean {
  const graph = new Map<string, string[]>();
  for (const action of wp.actions) {
    graph.set(action.action_id, action.depends_on);
  }
  const VISITING = 1;
  const DONE = 2;
  const state = new Map<string, number>();

  const visit = (node: string): boolean => {
    const current = state.get(node);
    if (current === VISITING) return true; // back-edge → cycle
    if (current === DONE) return false;
    state.set(node, VISITING);
    for (const next of graph.get(node) ?? []) {
      if (graph.has(next) && visit(next)) return true;
    }
    state.set(node, DONE);
    return false;
  };

  for (const id of graph.keys()) {
    if (visit(id)) return true;
  }
  return false;
}

/**
 * The subset of a Work Package that an approval is bound to. If any of this
 * changes, the approval is void (Contract Rule 11). Kept deterministic and
 * stable: keys sorted, actions ordered by action_id, only approval-relevant
 * fields included.
 */
interface FingerprintShape {
  intent: { raw_request: string; interpreted_goal: string; out_of_scope: string[] };
  permission_level_required: PermissionLevel;
  actions: Array<{
    action_id: string;
    type: string;
    tool: string | null;
    inputs: unknown;
    permission_level: PermissionLevel;
    reversible: boolean;
    depends_on: string[];
  }>;
}

function approvalRelevantShape(wp: WorkPackage): FingerprintShape {
  const actions = [...wp.actions]
    .sort((a, b) => a.action_id.localeCompare(b.action_id))
    .map((a) => ({
      action_id: a.action_id,
      type: a.type,
      tool: a.tool,
      inputs: a.inputs,
      permission_level: a.permission_level,
      reversible: a.reversible,
      depends_on: [...a.depends_on].sort(),
    }));
  return {
    intent: {
      raw_request: wp.intent.raw_request,
      interpreted_goal: wp.intent.interpreted_goal,
      out_of_scope: [...wp.intent.out_of_scope].sort(),
    },
    permission_level_required: wp.permission_level_required,
    actions,
  };
}

/** Recursively sort object keys so JSON serialisation is canonical. */
function canonicalise(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalise);
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = canonicalise((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value;
}

/**
 * sha256 over the approval-relevant fields (Build Spec Risk R3). The Approval
 * Service stores this at grant time and the Execution Plane re-checks it before
 * any Level 3 action runs.
 */
export function computeScopeFingerprint(wp: WorkPackage): string {
  const canonical = JSON.stringify(canonicalise(approvalRelevantShape(wp)));
  return createHash('sha256').update(canonical).digest('hex');
}
