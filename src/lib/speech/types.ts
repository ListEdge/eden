/**
 * Eden — Speech (text-to-speech) types.
 *
 * Voice output is provider-agnostic, like reasoning and place search: callers
 * depend on `SpeechProvider`, and ElevenLabs (first) or another engine plugs in
 * behind it. The provider returns raw audio bytes; the API route streams them
 * to the browser, so the ElevenLabs key never leaves the server.
 */

export interface SpeechSynthesisOptions {
  /** Override the configured voice. */
  voiceId?: string;
  /** Override the configured model. */
  modelId?: string;
}

export interface SpeechProvider {
  readonly id: string;
  /** MIME type of the audio returned by `synthesize` (e.g. 'audio/mpeg'). */
  readonly contentType: string;
  /** Turn text into spoken audio. */
  synthesize(text: string, opts?: SpeechSynthesisOptions): Promise<ArrayBuffer>;
}

export type SpeechProviderFactory = () => SpeechProvider;
