/**
 * Eden — Reasoning Plane types.
 *
 * The Reasoning Plane decides *what* should happen and *why*. It produces these
 * artifacts and nothing else: it never touches the outside world, never holds
 * tool credentials, and never writes final state (Core Contract §1).
 *
 * Determinism here is *structural*, not bit-identical (Build Spec Risk R6):
 * models run at temperature 0 with schema-constrained JSON output, and the
 * Classifier is a deterministic rule table the model may only escalate, never
 * relax.
 */

import type {
  PermissionLevel,
  WorkPackageAction,
  WorkPackageOutput,
} from '@/core/work-package/types';

/** Structured result of Stage 2 UNDERSTAND. */
export interface Understanding {
  goal: string;
  scope: string[];
  out_of_scope: string[];
  constraints: string[];
  assumptions: string[];
  /** Open unknowns; a non-empty set typically fails Gate A. */
  unknowns: string[];
}

/** A clarification question raised when intent is incomplete or ambiguous. */
export interface Question {
  id: string;
  text: string;
  /** 'free' for open text; 'choice' when the human must pick from options. */
  kind: 'free' | 'choice';
  options?: string[];
}

/** Outcome of Gate A (completeness / ambiguity). */
export interface GateAResult {
  proceed: boolean;
  /** Present (and non-empty) when `proceed` is false. */
  questions?: Question[];
}

/**
 * A planned action before it is assigned a final `action_id`/status by Memory.
 * Mirrors the executable fields of a Work Package action (Contract §4).
 */
export type ActionDraft = Pick<
  WorkPackageAction,
  'type' | 'tool' | 'inputs' | 'permission_level' | 'reversible' | 'depends_on'
>;

/**
 * A proposed Work Package emitted by the Planner (Stage 4), prior to
 * persistence. The Memory Plane turns drafts into real `WorkPackage`s.
 */
export interface WorkPackageDraft {
  interpreted_goal: string;
  out_of_scope: string[];
  constraints: string[];
  assumptions: string[];
  inputs_required: string[];
  acceptance_criteria: Criterion[];
  permission_level_required: PermissionLevel;
  plan_summary: string;
  actions: ActionDraft[];
  /** Other drafts in the same request this one depends on, by index. */
  depends_on_drafts: number[];
}

/**
 * An acceptance criterion. `machine` criteria are checked by the Verifier;
 * `judgment` criteria are assessed by the Reasoning Verifier with a recorded
 * rationale (Build Spec Risk R5).
 */
export interface Criterion {
  id: string;
  description: string;
  kind: 'machine' | 'judgment';
}

/** Verdict on a single criterion at VERIFY. */
export interface Verdict {
  criterion_id: string;
  passed: boolean;
  rationale: string;
}

/** A captured request as stored by Memory (input to UNDERSTAND). */
export interface RequestRecord {
  id: string;
  tenant_id: string;
  principal_id: string;
  raw_text: string;
  received_at: string;
}

/** Re-exported for convenience at call sites that judge against outputs. */
export type Output = WorkPackageOutput;
