/**
 * Eden — Reasoning Plane.
 *
 * Interface for the cognition stages of the loop: UNDERSTAND, Gate A, PLAN,
 * CLASSIFY, and judgment-VERIFY (Build Spec §6.2). Every method is a pure
 * cognitive transform that returns an artifact; none performs a side effect or
 * holds a tool credential (Core Contract §1, Rule 2).
 *
 * Milestone 2 implements UNDERSTAND (a real, schema-validated model call via the
 * provider abstraction) and Gate A (a deterministic completeness check). PLAN,
 * CLASSIFY, and judgment-VERIFY remain stubbed for later milestones.
 */

import { z } from 'zod';
import { NotImplementedError } from '@/lib/errors';
import { getReasoningProvider } from '@/lib/ai/registry';
import type {
  ActionDraft,
  Criterion,
  GateAResult,
  Output,
  Question,
  RequestRecord,
  Understanding,
  Verdict,
  WorkPackageDraft,
} from '@/core/reasoning/types';
import type { PermissionLevel } from '@/core/work-package/types';

export * from '@/core/reasoning/types';

/**
 * The shape the model must return for UNDERSTAND.
 *
 * Models occasionally answer a list field with a single sentence (or omit it)
 * rather than a JSON array. Rather than reject otherwise-good output, we accept
 * a string, an array, or null for the list fields and normalise to a string
 * array. `goal` is likewise coerced to a single string.
 */
const stringList = z
  .union([z.array(z.string()), z.string(), z.null()])
  .transform((v): string[] => {
    if (v == null) return [];
    if (Array.isArray(v)) return v.map((s) => s.trim()).filter(Boolean);
    const trimmed = v.trim();
    return trimmed ? [trimmed] : [];
  })
  .default([]);

const coercedString = z
  .union([z.string(), z.array(z.string()), z.null()])
  .transform((v): string => (Array.isArray(v) ? v.join(' ') : (v ?? '')))
  .default('');

const understandingSchema = z.object({
  goal: coercedString,
  scope: stringList,
  out_of_scope: stringList,
  constraints: stringList,
  assumptions: stringList,
  unknowns: stringList,
});

const UNDERSTAND_SYSTEM = [
  'You are the Reasoning Plane of Eden, an execution-first AI operating system.',
  'Your only job in this step is to UNDERSTAND a request — not to plan it or act on it.',
  'Read the request and produce a structured interpretation with these fields:',
  '- "goal": one clear sentence stating what the user actually wants achieved.',
  '- "scope": concrete things that are part of this request.',
  '- "out_of_scope": things a reader might assume but that are NOT being asked for.',
  '- "constraints": hard requirements or limits, stated or strongly implied.',
  '- "assumptions": things you are taking as true in order to proceed.',
  '- "unknowns": ONLY genuinely missing information that would block planning.',
  '  If the request is clear enough to plan, return an empty list. Never invent unknowns.',
  'Every list field must be a JSON array of short strings — use [] when there are none.',
  'Respond with a single JSON object containing exactly those keys.',
].join('\n');

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

export const reasoningPlane: ReasoningPlane = {
  async understand(req: RequestRecord): Promise<Understanding> {
    const provider = getReasoningProvider();
    const { data } = await provider.completeStructured({
      schema: understandingSchema,
      schemaName: 'Understanding',
      temperature: 0,
      messages: [
        { role: 'system', content: UNDERSTAND_SYSTEM },
        { role: 'user', content: req.raw_text },
      ],
    });
    return data;
  },

  async gateA(u: Understanding): Promise<GateAResult> {
    // Deterministic completeness check: genuine unknowns mean Eden must ask
    // rather than guess (Core Contract §2 — halting is a complete outcome).
    if (u.unknowns.length === 0) {
      return { proceed: true };
    }
    const questions: Question[] = u.unknowns.map((text, i) => ({
      id: `q${i + 1}`,
      text,
      kind: 'free',
    }));
    return { proceed: false, questions };
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
