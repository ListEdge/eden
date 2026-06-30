/**
 * Eden — OpenAI speech provider.
 *
 * Uses OpenAI's text-to-speech endpoint and returns MP3 audio bytes. It reuses
 * the existing OPENAI_API_KEY, works from a server on any OpenAI plan, and costs
 * a fraction of a cent per reply. Voice and model are configurable with sensible
 * defaults.
 *
 * Network note: server-side, calls api.openai.com.
 */

import { getOpenAISpeechConfig } from '@/lib/config/env';
import type { SpeechProvider, SpeechSynthesisOptions } from '@/lib/speech/types';

const SPEECH_URL = 'https://api.openai.com/v1/audio/speech';

export const openAISpeechProvider: SpeechProvider = {
  id: 'openai',
  contentType: 'audio/mpeg',

  async synthesize(text: string, opts?: SpeechSynthesisOptions): Promise<ArrayBuffer> {
    const { apiKey, model, voice } = getOpenAISpeechConfig();

    const res = await fetch(SPEECH_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: opts?.modelId ?? model,
        voice: opts?.voiceId ?? voice,
        input: text,
        response_format: 'mp3',
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`OpenAI speech request failed (HTTP ${res.status}): ${body.slice(0, 200)}`);
    }
    return res.arrayBuffer();
  },
};
