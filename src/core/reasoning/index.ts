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
import type { WebSearchResult } from '@/lib/search';
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
  '- You CAN find places to go, search the web for current information, and check the weather when',
  '  asked — that happens automatically, so you never need to explain how; just answer naturally.',
  '- You CANNOT yet take other real-world actions: booking, calling, emailing or messaging,',
  '  making payments, or accessing the person\'s calendar, files, or accounts. If asked to do one,',
  '  say plainly that you can\'t do that yet, and offer what you can do instead.',
  '- Prefer looking things up over guessing at specific current facts. General knowledge and',
  '  reasoning are welcome.',
  'Keep replies focused — usually a few sentences. For genuinely complex questions you may go',
  'longer, but stay clear and avoid rambling. Be encouraging and practical.',
].join('\n');

/**
 * Combined router + responder. One model call that both decides how to handle a
 * turn and, for plain conversation, writes the reply — replacing the separate
 * understand + classify + converse calls on the hot path, for speed.
 */
/** The ways Eden can handle a single turn. */
export type TurnAction = 'find_place' | 'generate_plan' | 'web_search' | 'get_weather' | 'chat';

const actionField = z
  .union([
    z.literal('find_place'),
    z.literal('generate_plan'),
    z.literal('web_search'),
    z.literal('get_weather'),
    z.literal('chat'),
    z.string(),
    z.null(),
  ])
  .transform((v): TurnAction => {
    if (v === 'find_place' || v === 'generate_plan' || v === 'web_search' || v === 'get_weather') {
      return v;
    }
    return 'chat';
  })
  .default('chat');

const routeSchema = z.object({
  action: actionField,
  goal: coercedString,
  reply: coercedString,
  cuisine: coercedNullableString,
  location: coercedNullableString,
  query: coercedString,
});

/** Lightweight classification (no reply) for the streaming path. */
const classifySchema = z.object({
  action: actionField,
  cuisine: coercedNullableString,
  location: coercedNullableString,
  query: coercedString,
});

/** Result of routing a turn. */
export interface TurnRoute {
  action: TurnAction;
  goal: string;
  reply: string;
  cuisine: string | null;
  location: string | null;
  query: string;
}

/** Result of classifying a turn (streaming path). */
export interface TurnClassification {
  action: TurnAction;
  cuisine: string | null;
  location: string | null;
  query: string;
}

const ROUTER_SYSTEM = [
  'You are Eden, a sharp, warm co-founder and personal assistant. Decide how to handle the message and respond in ONE step.',
  'Return a single JSON object with these keys:',
  '- "action": one of "find_place", "generate_plan", "web_search", "get_weather", or "chat".',
  '  • "find_place": the user wants you to find a specific place to GO TO now (restaurant, café,',
  '    bar, venue) — e.g. "find an Italian restaurant", "coffee nearby", "what about Thai instead".',
  '  • "generate_plan": the user is asking you to PUT TOGETHER / WRITE / CREATE the business plan',
  '    or strategy document now (e.g. "make the plan", "put it all together", "write up the plan",',
  '    or agreeing when you offered to). Choose this only when they want the written plan produced.',
  '  • "web_search": the user wants current, factual, or up-to-date information from the web —',
  '    news, prices, statistics, facts, research, "look it up", "search for…", "what\'s the latest on…",',
  '    or anything you would not reliably know from memory. Put the search query in "query".',
  '  • "get_weather": the user is asking about the weather. Put the place in "location" (from this',
  '    message or earlier in the conversation); leave it null to use their default area.',
  '  • "chat": everything else, including discussing or developing an idea.',
  '- "goal": a short one-line summary of what the user wants.',
  '- "cuisine": if find_place and a cuisine is mentioned, give it (e.g. "italian"), else null.',
  '- "location": if find_place or get_weather, the area/suburb/city — from this message or earlier — else null. Never invent one.',
  '- "query": if web_search, the search query to run (rewrite it into a clear, standalone query). Else "".',
  '- "reply": if action is "chat", your spoken reply. For any other action, use "".',
  'How to "chat": you are a genuine thinking partner. When the user shares an idea, an objective,',
  'or a problem, act like a great co-founder — ask one or two sharp, specific questions, challenge',
  'weak assumptions, and help sharpen the thinking. Do not dump many questions at once. When it',
  'feels like the idea has taken enough shape, offer to put together a full written plan.',
  'Keep spoken replies BRIEF and natural — 1–3 short sentences by default — since they are read aloud.',
  'Use the conversation context to resolve references like "that place" or "the first one".',
  "You are aware of the user's saved projects (listed above, when present). When it is genuinely",
  'relevant, reference or connect them (e.g. how a new idea relates to an existing project), but do',
  'not force a mention of projects into every reply.',
  'Be honest about limits: you CAN find places, produce written plans, search the web for current',
  "information, and check the weather. You cannot yet book, call, email, message, pay, build or deploy",
  "software, or access the user's private accounts, calendar, or files. If asked for one of those, say",
  'so plainly and offer what you can do instead. When you need current facts, prefer web_search over',
  'guessing. Respond with JSON only.',
].join('\n');

const CLASSIFY_SYSTEM = [
  'You are the fast router for Eden. Classify the user\'s message into ONE action. Do NOT write a reply.',
  'Return a single JSON object with these keys:',
  '- "action": one of "find_place", "generate_plan", "web_search", "get_weather", or "chat".',
  '  • "find_place": wants to find a place to go now (restaurant, café, bar, venue).',
  '  • "generate_plan": wants the written business plan / strategy produced now.',
  '  • "web_search": wants current, factual, or up-to-date info from the web (news, prices, facts,',
  '    research, "look it up", "latest on…", or anything you would not reliably know).',
  '  • "get_weather": asking about the weather.',
  '  • "chat": anything else — discussing or developing an idea, questions you can answer, general talk.',
  '- "cuisine": if find_place and a cuisine is mentioned (e.g. "italian"), else null.',
  '- "location": if find_place or get_weather, the area/city (from this message or earlier), else null.',
  '- "query": if web_search, a clear standalone search query. Else "".',
  '- "reply": always the empty string "". Do not write a reply.',
  'Use the conversation context to resolve references. Respond with JSON only.',
].join('\n');

const STREAM_CHAT_SYSTEM = [
  'You are Eden, a sharp, warm AI co-founder and personal assistant, speaking with the user.',
  'You are a genuine thinking partner: when the user shares an idea, an objective, or a problem, act',
  'like a great co-founder — ask one or two sharp, specific questions, challenge weak assumptions, and',
  'help sharpen the thinking. Do not dump many questions at once. When an idea has taken enough shape,',
  'offer to put together a full written plan.',
  'Keep replies BRIEF and natural — 1–3 short sentences by default — since they are read aloud.',
  "You are aware of the user's saved projects (listed below, when present). Reference or connect them",
  'only when genuinely relevant; do not force a mention into every reply.',
  'Be honest about limits: you can find places, search the web, check the weather, and write plans, but',
  "you cannot yet book, call, email, message, pay, build or deploy software, or access the user's private",
  'accounts, calendar, or files. If asked for one of those, say so plainly and offer what you can do.',
  'Reply in plain prose — no markdown, no headings, no lists.',
].join('\n');

const SEARCH_ANSWER_SYSTEM = [
  'You are Eden. Answer the user\'s question using ONLY the search results provided below.',
  'Be accurate and concise — 1–3 short sentences, natural to say aloud. If the results do not',
  'clearly answer the question, say what you did find and note that you couldn\'t confirm the rest.',
  'Do not invent facts beyond the results. Do not print URLs or say "according to source 1"; just',
  'answer plainly. The user can see the sources separately.',
].join('\n');

const BRIEF_SYSTEM = [
  'You are Eden, an AI assistant with the composed, precise, understated manner of JARVIS from Iron Man.',
  'You are greeting the user — whom you always address as "Sir" — as they open you. Give a SHORT spoken briefing.',
  'Manner and format:',
  '- Formal, courteous, and economical. Calm and quietly capable; never gushing, casual, or over-familiar.',
  '- 1–3 short sentences, natural to say aloud. No lists, no headings.',
  '- Open with a formal, time-appropriate greeting addressed to Sir. Use the time of day provided, e.g.',
  '  "Good morning, Sir." / "Good afternoon, Sir." / "Good evening, Sir." You may occasionally open with',
  '  "Welcome back, Sir." instead.',
  '- Then, if there are active projects, note what stands out (name the most relevant one or two) and',
  '  offer a brief, measured suggestion of what to attend to, as a trusted aide would.',
  '- If there are no projects yet, greet Sir and note that nothing is currently on the agenda, inviting',
  '  him to begin when ready.',
  '- Always address the user as "Sir", never by name. Do not invent projects or details. Do not enumerate every project.',
].join('\n');

/* ----- Business plan generation ----- */

const planSectionSchema = z
  .object({
    problem: coercedString,
    solution: coercedString,
    target_customer: coercedString,
    value_proposition: coercedString,
    market: coercedString,
    business_model: coercedString,
    go_to_market: coercedString,
    competition: coercedString,
    risks: coercedString,
  })
  .default({
    problem: '',
    solution: '',
    target_customer: '',
    value_proposition: '',
    market: '',
    business_model: '',
    go_to_market: '',
    competition: '',
    risks: '',
  });

const brandingSchema = z
  .object({
    name_ideas: stringList,
    positioning: coercedString,
    tone: coercedString,
    visual_direction: coercedString,
  })
  .default({ name_ideas: [], positioning: '', tone: '', visual_direction: '' });

const planSchema = z.object({
  title: coercedString,
  concept: coercedString,
  plan: planSectionSchema,
  next_steps: stringList,
  branding: brandingSchema,
});

/** A structured, written plan for an idea or objective. */
export interface BusinessPlan {
  title: string;
  concept: string;
  plan: {
    problem: string;
    solution: string;
    target_customer: string;
    value_proposition: string;
    market: string;
    business_model: string;
    go_to_market: string;
    competition: string;
    risks: string;
  };
  next_steps: string[];
  branding: {
    name_ideas: string[];
    positioning: string;
    tone: string;
    visual_direction: string;
  };
}

const PLAN_SYSTEM = [
  'You are Eden, an experienced co-founder and strategist. Using the conversation as your source',
  'material, produce a genuine, concrete written plan for the user\'s idea or objective — the kind',
  'a thoughtful founder would actually use, not vague filler.',
  'Return a single JSON object with these keys:',
  '- "title": a clear name for the idea (use the user\'s if given).',
  '- "concept": 2–4 sentences that sharpen the concept, not just restate it.',
  '- "plan": an object with string fields: "problem", "solution", "target_customer",',
  '  "value_proposition", "market", "business_model", "go_to_market", "competition", "risks".',
  '  Be specific and realistic; where the conversation left something unknown, make a sensible,',
  '  clearly reasonable assumption rather than hand-waving.',
  '- "next_steps": an array of 4–7 concrete, ordered actions the user could take next.',
  '- "branding": an object with "name_ideas" (3–5 distinct names), "positioning" (one line),',
  '  "tone" (a few words), and "visual_direction" (colours/typography/feel in 1–2 sentences).',
  'Be honest and useful. Respond with JSON only.',
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
  routeTurn(rawRequest: string, contextText?: string, worldContext?: string): Promise<TurnRoute>;
  /** Lean, fast classifier for the streaming path: decide the action only (no reply). */
  classifyTurn(rawRequest: string, contextText?: string): Promise<TurnRoute>;
  /** Stream a conversational reply token-by-token (used by the streaming path). */
  streamConverse(
    rawRequest: string,
    contextText?: string,
    worldContext?: string,
  ): AsyncIterable<string>;
  /** Produce a short spoken briefing of the user's world (their projects). */
  brief(worldContext: string, partOfDay?: string, contextText?: string): Promise<string>;
  /** Compose a brief, grounded spoken reply from web-search results. */
  summarizeSearch(
    query: string,
    answer: string | null,
    results: WebSearchResult[],
    contextText?: string,
  ): Promise<string>;
  /** Produce a structured written plan for an idea, using the conversation as source material. */
  generatePlan(rawRequest: string, contextText?: string): Promise<BusinessPlan>;
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

  async routeTurn(
    rawRequest: string,
    contextText?: string,
    worldContext?: string,
  ): Promise<TurnRoute> {
    const provider = getReasoningProvider();
    const messages: Message[] = [{ role: 'system', content: ROUTER_SYSTEM }];
    if (worldContext && worldContext.trim()) {
      messages.push({ role: 'system', content: worldContext });
    }
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
        query: data.query,
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
        query: '',
      };
    }
  },

  async summarizeSearch(
    query: string,
    answer: string | null,
    results: WebSearchResult[],
    contextText?: string,
  ): Promise<string> {
    const provider = getReasoningProvider();
    const sources = results
      .slice(0, 6)
      .map((r, i) => `[${i + 1}] ${r.title}\n${r.snippet}`)
      .join('\n\n');
    const messages: Message[] = [{ role: 'system', content: SEARCH_ANSWER_SYSTEM }];
    if (contextText && contextText.trim()) {
      messages.push({ role: 'system', content: `Conversation so far:\n${contextText}` });
    }
    const draft = answer ? `A draft answer to consider: ${answer}\n\n` : '';
    messages.push({
      role: 'user',
      content: `Question: ${query}\n\n${draft}Search results:\n${sources || '(no results)'}`,
    });
    const { text } = await provider.complete({ messages, temperature: 0.3, maxOutputTokens: 400 });
    return text.trim();
  },

  async brief(worldContext: string, partOfDay?: string, contextText?: string): Promise<string> {
    const provider = getReasoningProvider();
    const messages: Message[] = [{ role: 'system', content: BRIEF_SYSTEM }];
    if (contextText && contextText.trim()) {
      messages.push({ role: 'system', content: `Recent context:\n${contextText}` });
    }
    const timeLine = partOfDay && partOfDay.trim() ? `Time of day: ${partOfDay}.\n` : '';
    messages.push({ role: 'user', content: `${timeLine}${worldContext}\n\nGive the briefing now.` });
    const { text } = await provider.complete({ messages, temperature: 0.5, maxOutputTokens: 220 });
    return text.trim();
  },

  async classifyTurn(rawRequest: string, contextText?: string): Promise<TurnRoute> {
    const provider = getReasoningProvider();
    const messages: Message[] = [{ role: 'system', content: CLASSIFY_SYSTEM }];
    if (contextText && contextText.trim()) {
      messages.push({ role: 'system', content: `Conversation so far:\n${contextText}` });
    }
    messages.push({ role: 'user', content: rawRequest });
    try {
      const { data } = await provider.completeStructured({
        schema: routeSchema,
        schemaName: 'TurnClassification',
        temperature: 0,
        maxOutputTokens: 160,
        messages,
      });
      return {
        action: data.action,
        goal: data.goal || rawRequest,
        reply: '',
        cuisine: data.cuisine,
        location: data.location,
        query: data.query,
      };
    } catch {
      const isPlace = looksLikePlaceSearch(rawRequest) || scanCuisine(rawRequest) !== null;
      return {
        action: isPlace ? 'find_place' : 'chat',
        goal: rawRequest,
        reply: '',
        cuisine: scanCuisine(rawRequest),
        location: null,
        query: '',
      };
    }
  },

  async *streamConverse(
    rawRequest: string,
    contextText?: string,
    worldContext?: string,
  ): AsyncIterable<string> {
    const provider = getReasoningProvider();
    const messages: Message[] = [{ role: 'system', content: STREAM_CHAT_SYSTEM }];
    if (worldContext && worldContext.trim()) {
      messages.push({ role: 'system', content: worldContext });
    }
    if (contextText && contextText.trim()) {
      messages.push({ role: 'system', content: `Conversation so far:\n${contextText}` });
    }
    messages.push({ role: 'user', content: rawRequest });
    yield* provider.completeStream({ messages, temperature: 0.6, maxOutputTokens: 500 });
  },

  async generatePlan(rawRequest: string, contextText?: string): Promise<BusinessPlan> {
    const provider = getReasoningProvider();
    const messages: Message[] = [{ role: 'system', content: PLAN_SYSTEM }];
    if (contextText && contextText.trim()) {
      messages.push({
        role: 'system',
        content: `Conversation so far (use it as the source material for the plan):\n${contextText}`,
      });
    }
    messages.push({ role: 'user', content: rawRequest });
    const { data } = await provider.completeStructured({
      schema: planSchema,
      schemaName: 'BusinessPlan',
      temperature: 0.5,
      maxOutputTokens: 1800,
      messages,
    });
    return data;
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
