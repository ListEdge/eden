/**
 * Eden — Work Package types.
 *
 * The Work Package is the atomic unit of work and the ONLY object that crosses
 * plane boundaries (Core Contract §1, §4). Reasoning produces it, Memory stores
 * it, Execution consumes it. It is fully self-describing: intent, plan, actions,
 * and rollback all travel together.
 *
 * These types mirror the Core Contract §4 JSON schema 1:1 — including snake_case
 * field names — so the in-memory object, the API payload, and the Memory `jsonb`
 * are the same shape. That fidelity is intentional; do not "camelCase-ify" the
 * contract object.
 *
 * `ROLLBACK_FAILED` is a Build Spec addition over the Contract (Build Spec §4
 * T17 / Risk R4): a failed rollback must not masquerade as a clean one.
 */

/** Core Contract §3. The classifier assigns the minimum sufficient level. */
export type PermissionLevel = 1 | 2 | 3;

/** Closed status set. Contract §4 + Build Spec §4 (adds ROLLBACK_FAILED). */
export type WpStatus =
  | 'RECEIVED'
  | 'SPECIFIED'
  | 'PLANNED'
  | 'AWAITING_APPROVAL'
  | 'APPROVED'
  | 'EXECUTING'
  | 'VERIFYING'
  | 'COMPLETED'
  | 'BLOCKED_ON_INPUT'
  | 'BLOCKED_ON_TOOL'
  | 'FAILED'
  | 'ROLLED_BACK'
  | 'ROLLBACK_FAILED'
  | 'CANCELLED';

/** Action sub-machine. Contract §4 / Build Spec §4. */
export type ActionStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'SKIPPED' | 'ROLLED_BACK';

/** Action kinds. Build Spec §3 (`actions.type`). Only `tool_call` targets a system. */
export type ActionType = 'read' | 'transform' | 'stage' | 'tool_call';

export interface WorkPackageIntent {
  raw_request: string;
  interpreted_goal: string;
  out_of_scope: string[];
}

export interface WorkPackageSpec {
  constraints: string[];
  assumptions: string[];
  inputs_required: string[];
  acceptance_criteria: string[];
}

export interface WorkPackageApproval {
  required: boolean;
  granted: boolean;
  approved_by: string | null;
  /**
   * Transport-only. The approval token is NEVER persisted to Memory
   * (Memory System spec §4.5). Memory records that approval was granted (and by
   * whom), not the secret token itself.
   */
  approval_token: string | null;
  approved_at: string | null;
}

export interface WorkPackagePlanStep {
  step: number;
  description: string;
  /** action_ids this step produces. */
  produces: string[];
}

export interface WorkPackagePlan {
  summary: string;
  /** Points to the full decision log in the Reasoning Trace store. */
  reasoning_ref: string;
  steps: WorkPackagePlanStep[];
}

export interface WorkPackageAction {
  action_id: string;
  type: ActionType;
  /** Tool name for `tool_call` actions (e.g. 'vercel.deploy'); null otherwise. */
  tool: string | null;
  inputs: Record<string, unknown>;
  permission_level: PermissionLevel;
  reversible: boolean;
  rollback_action_id: string | null;
  status: ActionStatus;
  /** Points to the execution log entry once run. */
  log_ref: string | null;
  /** action_ids this action depends on (forms an acyclic DAG — Build Spec R12). */
  depends_on: string[];
}

export interface WorkPackageOutput {
  output_id: string;
  /** Must reference a real action_id (Contract §4 invariant). */
  produced_by: string;
  type: string;
  value: unknown | null;
  verified: boolean;
}

export interface WorkPackageDependencies {
  depends_on_packages: string[];
  blocks_packages: string[];
  external: string[];
}

export interface RollbackStep {
  rollback_id: string;
  /** action_id this step undoes. */
  undoes: string;
  method: string;
}

export interface WorkPackageRollbackPlan {
  strategy: string;
  /** action_ids that cannot be undone (Contract Rule 6). */
  irreversible_actions: string[];
  steps: RollbackStep[];
  /** Must be true before approval if any irreversible action exists (Contract §4). */
  irreversible_acknowledged: boolean;
}

export interface StatusHistoryEntry {
  status: WpStatus;
  at: string;
}

/** The complete, self-describing Work Package (Core Contract §4). */
export interface WorkPackage {
  id: string;
  version: number;
  created_at: string;
  updated_at: string;
  intent: WorkPackageIntent;
  spec: WorkPackageSpec;
  permission_level_required: PermissionLevel;
  approval: WorkPackageApproval;
  plan: WorkPackagePlan | null;
  actions: WorkPackageAction[];
  outputs: WorkPackageOutput[];
  dependencies: WorkPackageDependencies;
  rollback_plan: WorkPackageRollbackPlan;
  status: WpStatus;
  /** Append-only (Contract §4). */
  status_history: StatusHistoryEntry[];
}

/** Minimal input used to open a new Work Package at INGEST (Build Spec T1). */
export interface NewWorkPackageInput {
  raw_request: string;
  interpreted_goal?: string;
}
