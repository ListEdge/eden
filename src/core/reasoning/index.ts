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
  'You decide whether the user wants you to FIND a specific place to GO TO right now',
  '(a restaurant, café, bar, or venue) — an action — versus merely talking, asking advice,',
  'or discussing places in general.',
  'Return a single JSON object with these keys:',
  '- "is_place_search": true ONLY if the user wants you to find a place to go now',
  '  (e.g. "find an Italian restaurant", "where can I get coffee nearby", "what about Thai instead").',
  '  It is FALSE for discussion or advice (e.g. "I\'m thinking of opening a restaurant",',
  '  "what makes good Italian food", "tell me about that place you found") — those are conversation.',
  '- "what": short description of what they want to find (e.g. "restaurant"), else "".',
  '- "cuisine": the cuisine if mentioned (e.g. "italian"), else null.',
  '- "location": the area/suburb/city to search, ONLY if stated now or earlier in the conversation, else null.',
  'Do not guess a location that was never stated. Respond with JSON only.',
].join('\n');

const CONVERSE_SYSTEM = [
  'You are Eden, a warm, thoughtful personal assistant with a calm, direct manner.',
  'You are talking with the person you assist, and your replies are usually spoken aloud,',
  'so write naturally and keep them easy to listen to.',
  'You can hold a real conversation: reason things through, brainstorm, explain, give advice,',
  'draft text, and help the person think. Use the conversation context to stay on thread and',
  'resolve references like "that place" or "the first one".',
  'Be honest about your limits:',
  '- You CAN find places to go (restaurants, cafés, bars) when asked — that happens automatically,',
  '  so you never need to explain how; just answer naturally.',
  '- You CANNOT yet take other real-world actions: booking, calling, emailing or messaging,',
  '  making payments, or accessing the person\'s calendar, files, or accounts. If asked to do one,',
  '  say plainly that you can\'t do that yet, and offer what you can do instead.',
  '- Do not state specific real-time facts you cannot actually know (live prices, opening hours,',
  "  today's weather, current availability). General knowledge and reasoning are welcome.",
  'Keep replies focused — usually a few sentences. For genuinely complex questions you may go',
  'longer, but stay clear and avoid rambling. Be encouraging and practical.',
].join('\n');

/**
 * Combined router + responder. One model call that both decides how to handle a
 * turn and, for plain conversation, writes the reply — replacing the separate
 * understand + classify + converse calls on the hot path, for speed.
 */
const routeSchema = z.object({
  action: z
    .union([z.literal('find_place'), z.literal('chat'), z.string(), z.null()])
    .transform((v): 'find_place' | 'chat' => (v === 'find_place' ? 'find_place' : 'chat'))
    .default('chat'),
  goal: coercedString,
  reply: coercedString,
  cuisine: coercedNullableString,
  location: coercedNullableString,
});

/** Result of routing a turn. */
export interface TurnRoute {
  action: 'find_place' | 'chat';
  goal: string;
  reply: string;
  cuisine: string | null;
  location: string | null;
}

const ROUTER_SYSTEM = [
  'You are Eden, a warm, thoughtful personal assistant. Decide how to handle the message and respond in ONE step.',
  'Return a single JSON object with these keys:',
  '- "action": "find_place" ONLY if the user wants you to find a specific place to GO TO now',
  '  (restaurant, café, bar, venue) — e.g. "find an Italian restaurant", "coffee nearby",',
  '  "what about Thai instead". Asking advice or discussing places in general is "chat".',
  '- "goal": a short one-line summary of what the user wants.',
  '- "cuisine": if find_place and a cuisine is mentioned, give it (e.g. "italian"), else null.',
  '- "location": if find_place, the area/suburb/city to search — from this message or earlier in',
  '  the conversation — else null. Never invent a location.',
  '- "reply": if action is "chat", your spoken reply. If "find_place", use "".',
  'When writing "reply": be warm, concise, and natural — it is spoken aloud, so keep it to a few',
  'sentences unless more is truly needed. Use the conversation context to resolve references',
  'like "that place" or "the first one".',
  'Be honest about limits: you can find places, but you cannot yet book, call, email, message,',
  "pay, or access the user's calendar, files, or accounts, and you cannot read live data",
  '(current weather, live hours or availability). If asked, say so plainly. Do not invent',
  'real-time facts. General knowledge and reasoning are fine.',
  'Respond with JSON only.',
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
  /** One-call router + responder for the hot path: decide action vs chat, and reply if chat. */
  routeTurn(rawRequest: string, contextText?: string): Promise<TurnRoute>;
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
        // The model is authoritative here; the heuristic is only the fallback below.
        is_place_search: data.is_place_search,
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
    const { text } = await provider.complete({ messages, temperature: 0.5, maxOutputTokens: 500 });
    return text.trim();
  },

  async routeTurn(rawRequest: string, contextText?: string): Promise<TurnRoute> {
    const provider = getReasoningProvider();
    const messages: Message[] = [{ role: 'system', content: ROUTER_SYSTEM }];
    if (contextText && contextText.trim()) {
      messages.push({ role: 'system', content: `Conversation so far:\n${contextText}` });
    }
    messages.push({ role: 'user', content: rawRequest });
    try {
      const { data } = await provider.completeStructured({
        schema: routeSchema,
        schemaName: 'TurnRoute',
        temperature: 0.4,
        messages,
      });
      return {
        action: data.action,
        goal: data.goal || rawRequest,
        reply: data.reply,
        cuisine: data.cuisine,
        location: data.location,
      };
    } catch {
      // Fallback if the model call fails: route by keyword, generic reply for chat.
      const isPlace = looksLikePlaceSearch(rawRequest) || scanCuisine(rawRequest) !== null;
      return {
        action: isPlace ? 'find_place' : 'chat',
        goal: rawRequest,
        reply: isPlace ? '' : "I'm having trouble responding right now — could you try that again?",
        cuisine: scanCuisine(rawRequest),
        location: null,
      };
    }
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
