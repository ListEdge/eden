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
import type { Message } from '@/lib/ai/types';
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

/**
 * Tolerant schema for place-search intent extraction. Everything defaults, so
 * malformed model output cannot fail validation; if the call throws entirely,
 * the orchestrator falls back to keyword heuristics.
 */
const coercedBool = z
  .union([z.boolean(), z.string(), z.null()])
  .transform((v): boolean => {
    if (typeof v === 'boolean') return v;
    if (typeof v === 'string') return ['true', 'yes', 'y', '1'].includes(v.trim().toLowerCase());
    return false;
  })
  .default(false);

const coercedNullableString = z
  .union([z.string(), z.null()])
  .transform((v): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null))
  .default(null);

const placeIntentSchema = z.object({
  is_place_search: coercedBool,
  what: coercedString,
  cuisine: coercedNullableString,
  location: coercedNullableString,
});

/** Structured result describing whether (and how) a request wants to find a place. */
export interface PlaceIntent {
  is_place_search: boolean;
  what: string;
  cuisine: string | null;
  location: string | null;
}

const PLACE_KEYWORDS = [
  'restaurant', 'dinner', 'lunch', 'breakfast', 'brunch', 'eat', 'food',
  'cafe', 'café', 'coffee', 'bar', 'pub', 'dine', 'dining', 'takeaway',
  'takeout', 'reservation', 'book a table',
];
const CUISINE_WORDS = [
  'italian', 'pizza', 'chinese', 'indian', 'japanese', 'sushi', 'thai',
  'french', 'mexican', 'greek', 'spanish', 'korean', 'vietnamese', 'turkish',
  'lebanese', 'american', 'burger', 'seafood', 'asian',
];

function looksLikePlaceSearch(text: string): boolean {
  const t = text.toLowerCase();
  return PLACE_KEYWORDS.some((k) => t.includes(k));
}
function scanCuisine(text: string): string | null {
  const t = text.toLowerCase();
  return CUISINE_WORDS.find((c) => t.includes(c)) ?? null;
}

const PLACE_INTENT_SYSTEM = [
  'You decide whether a request is asking to FIND a place to go (restaurant, café, bar, venue).',
  'Return a single JSON object with these keys:',
  '- "is_place_search": true if the user wants to find/visit/eat at a place, else false.',
  '- "what": short description of what they want to find (e.g. "restaurant").',
  '- "cuisine": the cuisine if any is mentioned (e.g. "italian"), else null.',
  '- "location": the area/suburb/city to search, ONLY if stated now or earlier in the conversation, else null.',
  'Do not guess a location that was never stated. Respond with JSON only.',
].join('\n');

const CONVERSE_SYSTEM = [
  'You are Eden, a calm, concise personal assistant speaking out loud.',
  'Answer the user using ONLY the conversation context provided. You may discuss,',
  'compare, and reference things already found (e.g. restaurants in a previous list).',
  'Rules:',
  "- Do NOT invent facts you weren't given (prices, opening hours, ratings, weather, menus).",
  '- You can find places, but you cannot yet take real-world actions like booking, calling,',
  '  emailing, or paying. If asked to do one of those, say plainly that you can\'t do that yet.',
  '- If you lack the information to answer, say so briefly rather than guessing.',
  '- Keep replies to 1–3 short sentences, natural and suitable for being spoken aloud.',
].join('\n');

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
  /** Stage 2: turn a raw request into structured understanding (optionally given prior conversation). */
  understand(req: RequestRecord, contextText?: string): Promise<Understanding>;
  /** Gate A: decide whether intent is complete enough to plan, else ask. */
  gateA(u: Understanding): Promise<GateAResult>;
  /** Determine whether a request wants to find a place, and extract cuisine/location (context-aware). */
  extractPlaceQuery(rawRequest: string, u: Understanding, contextText?: string): Promise<PlaceIntent>;
  /** Produce a short, grounded conversational reply from prior context + the new message. */
  converse(contextText: string, userMessage: string): Promise<string>;
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
  async understand(req: RequestRecord, contextText?: string): Promise<Understanding> {
    const provider = getReasoningProvider();
    const messages: Message[] = [{ role: 'system', content: UNDERSTAND_SYSTEM }];
    if (contextText && contextText.trim()) {
      messages.push({
        role: 'system',
        content: `Recent conversation for context (resolve references like "the first one" or "that place" against it):\n${contextText}`,
      });
    }
    messages.push({ role: 'user', content: req.raw_text });
    const { data } = await provider.completeStructured({
      schema: understandingSchema,
      schemaName: 'Understanding',
      temperature: 0,
      messages,
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

  async extractPlaceQuery(
    rawRequest: string,
    u: Understanding,
    contextText?: string,
  ): Promise<PlaceIntent> {
    // Heuristic baseline — always available, never fails. A cuisine mention
    // (e.g. "what about Thai?") counts as a place search even without a keyword.
    const cuisineHit = scanCuisine(`${rawRequest} ${u.goal}`);
    const heuristic: PlaceIntent = {
      is_place_search: looksLikePlaceSearch(rawRequest) || cuisineHit !== null,
      what: 'place',
      cuisine: cuisineHit,
      location: null,
    };
    try {
      const provider = getReasoningProvider();
      const messages: Message[] = [{ role: 'system', content: PLACE_INTENT_SYSTEM }];
      if (contextText && contextText.trim()) {
        messages.push({
          role: 'system',
          content: `Recent conversation for context (use it to fill in a location or cuisine the user is still referring to):\n${contextText}`,
        });
      }
      messages.push({ role: 'user',
        content: `Request: ${rawRequest}\nInterpreted goal: ${u.goal}`,
      });
      const { data } = await provider.completeStructured({
        schema: placeIntentSchema,
        schemaName: 'PlaceIntent',
        temperature: 0,
        messages,
      });
      return {
        is_place_search: data.is_place_search || heuristic.is_place_search,
        what: data.what || heuristic.what,
        cuisine: data.cuisine ?? heuristic.cuisine,
        location: data.location ?? heuristic.location,
      };
    } catch {
      return heuristic;
    }
  },

  async converse(contextText: string, userMessage: string): Promise<string> {
    const provider = getReasoningProvider();
    const messages: Message[] = [{ role: 'system', content: CONVERSE_SYSTEM }];
    if (contextText && contextText.trim()) {
      messages.push({ role: 'system', content: `Conversation so far:\n${contextText}` });
    }
    messages.push({ role: 'user', content: userMessage });
    const { text } = await provider.complete({ messages, temperature: 0.3, maxOutputTokens: 200 });
    return text.trim();
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
