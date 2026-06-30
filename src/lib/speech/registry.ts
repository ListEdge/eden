/**
 * Eden — Speech provider registry.
 *
 * Mirrors the reasoning and places registries: providers register by id, the
 * configured one (default 'elevenlabs', via EDEN_SPEECH_PROVIDER) is resolved on
 * demand and memoised. Adding another engine later is: implement it, register
 * it here, set the env var.
 */

import { ConfigurationError } from '@/lib/errors';
import { getSpeechProviderId } from '@/lib/config/env';
import type { SpeechProvider, SpeechProviderFactory } from '@/lib/speech/types';
import { elevenLabsProvider } from '@/lib/speech/providers/elevenlabs';
import { openAISpeechProvider } from '@/lib/speech/providers/openai';

const factories = new Map<string, SpeechProviderFactory>();
const instances = new Map<string, SpeechProvider>();

export function registerSpeechProvider(id: string, factory: SpeechProviderFactory): void {
  factories.set(id, factory);
}

export function getSpeechProvider(): SpeechProvider {
  const id = getSpeechProviderId();
  const existing = instances.get(id);
  if (existing) return existing;

  const factory = factories.get(id);
  if (!factory) {
    throw new ConfigurationError(
      `Unknown speech provider "${id}". Registered: ${[...factories.keys()].join(', ') || 'none'}.`,
    );
  }
  const instance = factory();
  instances.set(id, instance);
  return instance;
}

// Built-in providers.
registerSpeechProvider('openai', () => openAISpeechProvider);
registerSpeechProvider('elevenlabs', () => elevenLabsProvider);
