'use client';

/**
 * Eden — Assistant (conversational, press to talk).
 *
 * A chat with Eden: tap the mic and speak, or type. Eden remembers the
 * conversation, so follow-ups like "what about Thai?" or "which is closest?"
 * resolve in context. Each reply is shown and spoken back (via /api/eden/speak).
 *
 * Speech-in uses the browser's built-in Web Speech API where available (Chrome,
 * Edge, Safari); the typed input is the fallback, so the page works everywhere.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

/* ---- Minimal Web Speech API typings (not in standard lib.dom) ---- */
interface SpeechResultAlt {
  transcript: string;
}
interface SpeechResult {
  0: SpeechResultAlt;
  isFinal: boolean;
}
interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechResult>;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

/* ---- Eden response shapes (the parts this page reads) ---- */
interface PlaceResult {
  name: string;
  address: string | null;
  distanceMeters: number | null;
  website: string | null;
}
interface RunData {
  conversation_id: string;
  status: string;
  reply: string;
  results?: PlaceResult[];
  error?: string;
}

interface ChatMessage {
  role: 'user' | 'eden';
  text: string;
  results?: PlaceResult[];
}

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export default function AssistantPage() {
  const recognitionSupported = useMemo(() => getRecognitionCtor() !== null, []);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [listening, setListening] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'thinking' | 'speaking'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [pendingAudioUrl, setPendingAudioUrl] = useState<string | null>(null);

  const playAudio = useCallback(async (url: string) => {
    try {
      if (audioRef.current) audioRef.current.pause();
      const audio = new Audio(url);
      audioRef.current = audio;
      setSpeaking(true);
      audio.onended = () => setSpeaking(false);
      await audio.play();
      setPendingAudioUrl(null);
    } catch {
      setSpeaking(false);
      setPendingAudioUrl(url); // autoplay blocked — show a manual play button
    }
  }, []);

  const speak = useCallback(
    async (text: string) => {
      if (!text) return;
      try {
        setPhase('speaking');
        const res = await fetch('/api/eden/speak', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
        if (!res.ok) return; // voice failed — the on-screen reply still stands
        const blob = await res.blob();
        await playAudio(URL.createObjectURL(blob));
      } catch {
        // ignore voice errors
      } finally {
        setPhase('idle');
      }
    },
    [playAudio],
  );

  const submit = useCallback(
    async (text: string) => {
      const clean = text.trim();
      if (!clean || busy) return;
      setBusy(true);
      setError(null);
      setPendingAudioUrl(null);
      setMessages((m) => [...m, { role: 'user', text: clean }]);
      setPhase('thinking');
      try {
        const res = await fetch('/api/eden/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            raw_request: clean,
            conversation_id: conversationId ?? undefined,
          }),
        });
        const json = await res.json();
        if (!json.ok) {
          setError(json.error?.message ?? 'Eden could not process that request.');
          setPhase('idle');
          return;
        }
        const data = json.data as RunData;
        setConversationId(data.conversation_id);
        setMessages((m) => [...m, { role: 'eden', text: data.reply, results: data.results }]);
        await speak(data.reply);
      } catch {
        setError('Could not reach Eden. Check your connection and try again.');
        setPhase('idle');
      } finally {
        setBusy(false);
      }
    },
    [busy, conversationId, speak],
  );

  const toggleListen = useCallback(() => {
    if (busy) return;
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    const recognition = new Ctor();
    recognition.lang = 'en-NZ';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognitionRef.current = recognition;

    let finalText = '';
    setError(null);
    recognition.onresult = (e) => {
      finalText = '';
      for (let i = 0; i < e.results.length; i += 1) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
      }
    };
    recognition.onerror = (e) => {
      if (e.error && e.error !== 'aborted' && e.error !== 'no-speech') {
        setError(`Microphone error: ${e.error}`);
      }
    };
    recognition.onend = () => {
      setListening(false);
      const said = finalText.trim();
      if (said) void submit(said);
    };
    recognition.start();
    setListening(true);
  }, [busy, listening, submit]);

  const onTypedSubmit = useCallback(() => {
    const text = typed;
    setTyped('');
    void submit(text);
  }, [typed, submit]);

  const newConversation = useCallback(() => {
    if (audioRef.current) audioRef.current.pause();
    setConversationId(null);
    setMessages([]);
    setError(null);
    setPendingAudioUrl(null);
    setPhase('idle');
  }, []);

  const statusText = !recognitionSupported
    ? 'voice input not supported here — type below'
    : listening
      ? 'listening… tap to stop'
      : phase === 'thinking'
        ? 'eden is thinking…'
        : phase === 'speaking' || speaking
          ? 'eden is speaking…'
          : messages.length === 0
            ? 'tap to talk'
            : 'tap to continue';

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10 sm:py-14">
      <header className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-xl font-medium tracking-tight text-mist">eden</span>
          <span className="font-mono text-xs text-faint">assistant</span>
        </div>
        <div className="flex items-center gap-4">
          {messages.length > 0 ? (
            <button
              type="button"
              onClick={newConversation}
              className="font-mono text-[0.7rem] text-faint hover:text-muted"
            >
              new chat
            </button>
          ) : null}
          <Link href="/" className="font-mono text-[0.7rem] text-faint hover:text-muted">
            status →
          </Link>
        </div>
      </header>

      {/* Conversation */}
      {messages.length > 0 ? (
        <section className="flex flex-col gap-3">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={msg.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
            >
              <div
                className={[
                  'max-w-[85%] rounded-lg px-4 py-2.5 text-sm leading-relaxed',
                  msg.role === 'user'
                    ? 'bg-verd/15 text-mist'
                    : 'border border-edge bg-panel/60 text-mist',
                ].join(' ')}
              >
                <p>{msg.text}</p>
                {msg.results && msg.results.length > 0 ? (
                  <ul className="mt-2 flex flex-col divide-y divide-edge-soft border-t border-edge-soft">
                    {msg.results.map((r, j) => (
                      <li key={`${r.name}-${j}`} className="flex flex-col gap-0.5 py-2">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="text-sm text-mist">{r.name}</span>
                          {typeof r.distanceMeters === 'number' ? (
                            <span className="shrink-0 font-mono text-[0.65rem] text-faint">
                              {(r.distanceMeters / 1000).toFixed(1)} km
                            </span>
                          ) : null}
                        </div>
                        {r.address ? <span className="text-xs text-muted">{r.address}</span> : null}
                        {r.website ? (
                          <a
                            href={r.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-[0.7rem] text-verd hover:underline"
                          >
                            website →
                          </a>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          ))}
        </section>
      ) : (
        <p className="py-8 text-center text-sm text-muted">
          Ask Eden to find somewhere to eat, then follow up naturally —
          <br className="hidden sm:block" /> &ldquo;what about Thai?&rdquo;, &ldquo;which is
          closest?&rdquo;
        </p>
      )}

      {/* Mic */}
      <section className="flex flex-col items-center gap-4 py-2">
        <button
          type="button"
          onClick={toggleListen}
          disabled={busy || !recognitionSupported}
          aria-label={listening ? 'Stop listening' : 'Start talking'}
          className={[
            'flex h-20 w-20 items-center justify-center rounded-full border transition-colors',
            listening
              ? 'border-verd bg-verd/15 text-verd eden-live'
              : 'border-edge bg-panel text-muted hover:border-verd-dim hover:text-mist',
            busy || !recognitionSupported ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
          ].join(' ')}
        >
          <MicIcon />
        </button>
        <p className="h-4 text-center font-mono text-[0.7rem] uppercase tracking-[0.18em] text-faint">
          {statusText}
        </p>
        {pendingAudioUrl ? (
          <button
            type="button"
            onClick={() => void playAudio(pendingAudioUrl)}
            className="rounded-md border border-verd-dim bg-verd/10 px-3 py-1.5 font-mono text-xs text-verd"
          >
            ▶ Play Eden&apos;s reply
          </button>
        ) : null}
      </section>

      {error ? (
        <div className="rounded-lg border border-edge bg-panel/60 px-4 py-3 text-sm text-muted">
          {error}
        </div>
      ) : null}

      {/* Typed input */}
      <div className="mt-auto flex items-center gap-2 border-t border-edge-soft pt-4">
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onTypedSubmit();
          }}
          placeholder="…or type to Eden"
          disabled={busy}
          className="flex-1 rounded-md border border-edge bg-ink px-3 py-2 text-sm text-mist outline-none placeholder:text-faint focus:border-verd-dim"
        />
        <button
          type="button"
          onClick={onTypedSubmit}
          disabled={busy || !typed.trim()}
          className="rounded-md border border-edge bg-panel px-4 py-2 font-mono text-xs text-mist transition-colors hover:border-verd-dim disabled:cursor-not-allowed disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </main>
  );
}

function MicIcon() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  );
}
