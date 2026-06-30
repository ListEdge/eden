/**
 * Eden — ElevenLabs speech provider.
 *
 * Calls the ElevenLabs text-to-speech API and returns MP3 audio bytes. The key
 * is read server-side only. Voice and model are configurable; sensible defaults
 * are applied so it works with just a key.
 *
 * Network note: server-side, calls api.elevenlabs.io.
 */

import { getSpeechConfig } from '@/lib/config/env';
import type { SpeechProvider, SpeechSynthesisOptions } from '@/lib/speech/types';

const TTS_URL = 'https://api.elevenlabs.io/v1/text-to-speech';

export const elevenLabsProvider: SpeechProvider = {
  id: 'elevenlabs',
  contentType: 'audio/mpeg',

  async synthesize(text: string, opts?: SpeechSynthesisOptions): Promise<ArrayBuffer> {
    const { apiKey, voiceId, modelId } = getSpeechConfig();
    const vid = opts?.voiceId ?? voiceId;
    const mid = opts?.modelId ?? modelId;

    const res = await fetch(`${TTS_URL}/${encodeURIComponent(vid)}`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: mid,
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`ElevenLabs request failed (HTTP ${res.status}): ${body.slice(0, 200)}`);
    }
    return res.arrayBuffer();
  },
};
