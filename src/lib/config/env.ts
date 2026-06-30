/**
 * Eden — Environment variable management.
 *
 * Milestone 1 wires Supabase and OpenAI as *configured-but-optional*: the app
 * builds and deploys with zero secrets set. Validation is therefore lazy — a
 * missing credential throws a precise `ConfigurationError` only when the
 * capability is actually used, not at import/build time.
 *
 * Secret discipline (Memory System spec §4.5, Build Spec R15): service-role and
 * provider keys are SERVER-ONLY. The accessors below refuse to hand a server
 * secret to browser code. `NEXT_PUBLIC_*` values are the only ones safe to ship
 * to the client.
 */

import { z } from 'zod';
import { ConfigurationError } from '@/lib/errors';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // Supabase (Memory Plane substrate). Public pair is browser-safe.
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(), // server-only

  // Reasoning provider (first provider; abstraction supports more — see lib/ai).
  OPENAI_API_KEY: z.string().min(1).optional(), // server-only
  OPENAI_MODEL: z.string().min(1).optional(),
  // Which provider the Reasoning Plane uses. Default 'openai'; 'anthropic' etc. addable.
  EDEN_REASONING_PROVIDER: z.string().min(1).optional(),

  // Places provider (first real Execution tool; abstraction supports more — see lib/places).
  GEOAPIFY_API_KEY: z.string().min(1).optional(), // server-only
  // Which provider the place-search tool uses. Default 'geoapify'; 'google' etc. addable.
  EDEN_PLACES_PROVIDER: z.string().min(1).optional(),
  // Optional fallback location used when a request names no place (e.g. "Christchurch, New Zealand").
  EDEN_DEFAULT_LOCATION: z.string().min(1).optional(),

  // Speech (voice output) provider — see lib/speech. OpenAI (default) and ElevenLabs.
  ELEVENLABS_API_KEY: z.string().min(1).optional(), // server-only
  ELEVENLABS_VOICE_ID: z.string().min(1).optional(),
  ELEVENLABS_MODEL: z.string().min(1).optional(),
  EDEN_SPEECH_PROVIDER: z.string().min(1).optional(),
  // OpenAI voice (uses OPENAI_API_KEY). Works from a server on any OpenAI plan.
  OPENAI_TTS_MODEL: z.string().min(1).optional(),
  OPENAI_TTS_VOICE: z.string().min(1).optional(),

  // Operational
  EDEN_LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).optional(),
});

type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

/** Parse + cache the environment once. Optional vars never fail the build. */
function env(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // Only malformed *present* values land here (e.g. a non-URL Supabase URL).
    throw new ConfigurationError('Invalid environment configuration', {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  cached = parsed.data;
  return cached;
}

/** Guard: refuse to read server secrets from browser code. */
function assertServer(accessor: string): void {
  if (typeof window !== 'undefined') {
    throw new ConfigurationError(`${accessor} is server-only and must not be accessed in the browser`);
  }
}

export interface SupabaseBrowserConfig {
  url: string;
  anonKey: string;
}
export interface SupabaseServerConfig {
  url: string;
  serviceRoleKey: string;
}
export interface OpenAIConfig {
  apiKey: string;
  /** Model the account can access. Override via OPENAI_MODEL. */
  model: string;
}

/** Browser-safe Supabase config (anon key). Throws if not configured. */
export function getSupabaseBrowserConfig(): SupabaseBrowserConfig {
  const e = env();
  if (!e.NEXT_PUBLIC_SUPABASE_URL || !e.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new ConfigurationError(
      'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.',
    );
  }
  return { url: e.NEXT_PUBLIC_SUPABASE_URL, anonKey: e.NEXT_PUBLIC_SUPABASE_ANON_KEY };
}

/** Server-only Supabase config (service-role key). Never exposed to the client. */
export function getSupabaseServerConfig(): SupabaseServerConfig {
  assertServer('SUPABASE_SERVICE_ROLE_KEY');
  const e = env();
  if (!e.NEXT_PUBLIC_SUPABASE_URL || !e.SUPABASE_SERVICE_ROLE_KEY) {
    throw new ConfigurationError(
      'Supabase server access is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
    );
  }
  return { url: e.NEXT_PUBLIC_SUPABASE_URL, serviceRoleKey: e.SUPABASE_SERVICE_ROLE_KEY };
}

/** Server-only OpenAI config. */
export function getOpenAIConfig(): OpenAIConfig {
  assertServer('OPENAI_API_KEY');
  const e = env();
  if (!e.OPENAI_API_KEY) {
    throw new ConfigurationError('OpenAI is not configured. Set OPENAI_API_KEY.');
  }
  // Default kept conservative; set OPENAI_MODEL to a model your key can access.
  return { apiKey: e.OPENAI_API_KEY, model: e.OPENAI_MODEL ?? 'gpt-4o-mini' };
}

/** Which reasoning provider to use. Default 'openai'. */
export function getReasoningProviderId(): string {
  return env().EDEN_REASONING_PROVIDER ?? 'openai';
}

export interface PlacesConfig {
  apiKey: string;
}

/** Server-only places-provider config (Geoapify by default). */
export function getPlacesConfig(): PlacesConfig {
  assertServer('GEOAPIFY_API_KEY');
  const e = env();
  if (!e.GEOAPIFY_API_KEY) {
    throw new ConfigurationError('Place search is not configured. Set GEOAPIFY_API_KEY.');
  }
  return { apiKey: e.GEOAPIFY_API_KEY };
}

/** Which place-search provider to use. Default 'geoapify'. */
export function getPlacesProviderId(): string {
  return env().EDEN_PLACES_PROVIDER ?? 'geoapify';
}

/** Optional fallback location for requests that name no place. */
export function getDefaultLocation(): string | null {
  return env().EDEN_DEFAULT_LOCATION ?? null;
}

export interface SpeechConfig {
  apiKey: string;
  voiceId: string;
  modelId: string;
}

/** Server-only speech-provider config (ElevenLabs). */
export function getSpeechConfig(): SpeechConfig {
  assertServer('ELEVENLABS_API_KEY');
  const e = env();
  if (!e.ELEVENLABS_API_KEY) {
    throw new ConfigurationError('ElevenLabs voice is not configured. Set ELEVENLABS_API_KEY.');
  }
  return {
    apiKey: e.ELEVENLABS_API_KEY,
    // Default voice "Rachel"; override via ELEVENLABS_VOICE_ID.
    voiceId: e.ELEVENLABS_VOICE_ID ?? '21m00Tcm4TlvDq8ikWAM',
    modelId: e.ELEVENLABS_MODEL ?? 'eleven_turbo_v2_5',
  };
}

export interface OpenAISpeechConfig {
  apiKey: string;
  model: string;
  voice: string;
}

/** Server-only OpenAI voice config (reuses OPENAI_API_KEY). */
export function getOpenAISpeechConfig(): OpenAISpeechConfig {
  assertServer('OPENAI_API_KEY');
  const e = env();
  if (!e.OPENAI_API_KEY) {
    throw new ConfigurationError('OpenAI voice needs OPENAI_API_KEY.');
  }
  return {
    apiKey: e.OPENAI_API_KEY,
    model: e.OPENAI_TTS_MODEL ?? 'tts-1',
    voice: e.OPENAI_TTS_VOICE ?? 'alloy',
  };
}

/** Which speech provider to use. Default 'openai' (works on any OpenAI plan from a server). */
export function getSpeechProviderId(): string {
  return env().EDEN_SPEECH_PROVIDER ?? 'openai';
}

/** Soft checks for health/status reporting — never throw, never reveal values. */
export function configStatus(): {
  supabasePublic: boolean;
  supabaseServer: boolean;
  openai: boolean;
  places: boolean;
  speech: boolean;
} {
  const e = env();
  return {
    supabasePublic: Boolean(e.NEXT_PUBLIC_SUPABASE_URL && e.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    supabaseServer: Boolean(e.NEXT_PUBLIC_SUPABASE_URL && e.SUPABASE_SERVICE_ROLE_KEY),
    openai: Boolean(e.OPENAI_API_KEY),
    places: Boolean(e.GEOAPIFY_API_KEY),
    // Voice works if either provider is configured (OpenAI is the default).
    speech: Boolean(e.OPENAI_API_KEY || e.ELEVENLABS_API_KEY),
  };
}

export function nodeEnv(): Env['NODE_ENV'] {
  return env().NODE_ENV;
}
