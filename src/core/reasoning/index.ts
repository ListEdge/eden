/**
 * Eden — Reasoning Plane.
 *
 * Interface for the cognition stages of the loop: UNDERSTAND, Gate A, PLAN,
 * CLASSIFY, and judgment-VERIFY (Build Spec §6.2). Every method is a pure
 * cognitive transform that returns an artifact; none performs a side effect or
 * holds a tool credential (Core Contract §1, Rule 2).
 *
 * Milestone 1 ships the interface and a loud stub. The concrete implementation
 * (Phase 1+) is built on the provider abstraction in `src/lib/ai`, so the
 * underlying model — OpenAI now, Anthropic later — is swappable without
 * touching callers.
 */

import { NotImplementedError } from '@/lib/errors';
import type {
  ActionDraft,
  Criterion,
  GateAResult,
  Output,
  RequestRecord,
  Understanding,
  Verdict,
  WorkPackageDraft,
} from '@/core/reasoning/types';
import type { PermissionLevel } from '@/core/work-package/types';

export * from '@/core/reasoning/types';

export interface ReasoningPlane {
  /** Stage 2: turn a raw request into structured understanding. */
  understand(req: RequestRecord): Promise<Understanding>;
  /** Gate A: decide whether intent is complete enough to plan, else ask. */
  gateA(u: Understanding): Promise<GateAResult>;
  /** Stage 4: decompose into one or more Work Package drafts. Throws on a cyclic DAG. */
  plan(u: Understanding): Promise<WorkPackageDraft[]>;
  /**
   * Assign the minimum sufficient permission level to an action. Backed by a
   * deterministic rule table; the model MAY raise the level but never lower it
   * (Build Spec Risk R6, Contract Rule 5).
   */
  classify(action: ActionDraft): Promise<PermissionLevel>;
  /** Judgment-VERIFY: assess a non-machine criterion against produced outputs. */
  judge(criterion: Criterion, outputs: Output[]): Promise<Verdict>;
}

/** Placeholder Reasoning Plane for Milestone 1. */
export const reasoningPlane: ReasoningPlane = {
  understand() {
    throw new NotImplementedError('ReasoningPlane.understand', 'Reasoning milestone (Phase 1)');
  },
  gateA() {
    throw new NotImplementedError('ReasoningPlane.gateA', 'Reasoning milestone (Phase 1)');
  },
  plan() {
    throw new NotImplementedError('ReasoningPlane.plan', 'Planner milestone (Phase 2)');
  },
  classify() {
    throw new NotImplementedError('ReasoningPlane.classify', 'Planner milestone (Phase 2)');
  },
  judge() {
    throw new NotImplementedError('ReasoningPlane.judge', 'Verifier milestone (Phase 5)');
  },
};
