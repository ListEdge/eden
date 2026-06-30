'use client';

/**
 * Eden — Assistant (press to talk).
 *
 * A real interface for Eden: tap the mic and speak (browser speech recognition),
 * or type. Eden runs its loop on the server (/api/eden/run), the result is shown,
 * and a short spoken reply is played back via /api/eden/speak (ElevenLabs).
 *
 * Speech recognition uses the browser's built-in Web Speech API where available
 * (Chrome, Edge, Safari). Where it isn't, the typed input is the fallback, so the
 * page works everywhere.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

/* ---- Minimal Web Speech API typings (kept local; not in standard lib.dom) ---- */
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
  status: string;
  understanding?: { goal?: string };
  gate_a?: { questions?: { id: string; text: string }[] };
  results?: PlaceResult[];
  error?: string;
  note?: string;
}

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Build the short sentence Eden speaks back, from the structured result. */
function composeSpoken(d: RunData | null): string {
  if (!d) return '';
  if (d.status === 'COMPLETED' && Array.isArray(d.results)) {
    const r = d.results;
    if (r.length === 0) return "I searched, but didn't find anything matching that.";
    const top = r.slice(0, 3).map((x) => x.name);
    const names =
      top.length > 1 ? `${top.slice(0, -1).join(', ')} and ${top[top.length - 1]}` : top[0];
    return `I found ${r.length} options. The closest are ${names}. Want details on any of them?`;
  }
  if (d.status === 'BLOCKED_ON_INPUT') {
    const q = d.gate_a?.questions?.[0]?.text;
    return q ? `I need a little more information. ${q}` : 'I need a little more information to continue.';
  }
  if (d.status === 'FAILED') {
    return d.error ? `Something went wrong. ${d.error}` : 'Something went wrong.';
  }
  if (d.status === 'SPECIFIED') {
    return d.understanding?.goal
      ? `I understood: ${d.understanding.goal}. I don't have a tool for that one yet.`
      : "I understood your request, but I don't have a tool for that one yet.";
  }
  return 'Done.';
}

const STATUS_LABELS: Record<string, string> = {
  COMPLETED: 'Completed',
  BLOCKED_ON_INPUT: 'Needs clarification',
  SPECIFIED: 'Understood',
  FAILED: 'Failed',
};

export default function AssistantPage() {
  const recognitionSupported = useMemo(() => getRecognitionCtor() !== null, []);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'thinking' | 'speaking'>('idle');
  const [result, setResult] = useState<RunData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingAudioUrl, setPendingAudioUrl] = useState<string | null>(null);

  const playAudio = useCallback(async (url: string) => {
    try {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      const audio = new Audio(url);
      audioRef.current = audio;
      setSpeaking(true);
      audio.onended = () => setSpeaking(false);
      await audio.play();
      setPendingAudioUrl(null);
    } catch {
      // Autoplay blocked — surface a manual play button.
      setSpeaking(false);
      setPendingAudioUrl(url);
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
        if (!res.ok) {
          // Voice failed (e.g. key not set) — not fatal; the text answer still shows.
          return;
        }
        const blob = await res.blob();
        await playAudio(URL.createObjectURL(blob));
      } catch {
        // Ignore voice errors; the on-screen answer is the source of truth.
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
      setResult(null);
      setPendingAudioUrl(null);
      setPhase('thinking');
      try {
        const res = await fetch('/api/eden/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ raw_request: clean }),
        });
        const json = await res.json();
        if (!json.ok) {
          setError(json.error?.message ?? 'Eden could not process that request.');
          setPhase('idle');
          return;
        }
        const data = json.data as RunData;
        setResult(data);
        await speak(composeSpoken(data));
      } catch {
        setError('Could not reach Eden. Check your connection and try again.');
        setPhase('idle');
      } finally {
        setBusy(false);
      }
    },
    [busy, speak],
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
    setTranscript('');
    setError(null);

    recognition.onresult = (e) => {
      let interim = '';
      for (let i = 0; i < e.results.length; i += 1) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      setTranscript((finalText + interim).trim());
    };
    recognition.onerror = (e) => {
      if (e.error && e.error !== 'aborted' && e.error !== 'no-speech') {
        setError(`Microphone error: ${e.error}`);
      }
    };
    recognition.onend = () => {
      setListening(false);
      const said = finalText.trim();
      if (said) {
        setTranscript(said);
        void submit(said);
      }
    };

    recognition.start();
    setListening(true);
  }, [busy, listening, submit]);

  const onTypedSubmit = useCallback(() => {
    const text = typed;
    setTyped('');
    setTranscript(text.trim());
    void submit(text);
  }, [typed, submit]);

  const statusLabel = result ? (STATUS_LABELS[result.status] ?? result.status) : null;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-12 sm:py-16">
      <header className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-xl font-medium tracking-tight text-mist">eden</span>
          <span className="font-mono text-xs text-faint">assistant</span>
        </div>
        <Link href="/" className="font-mono text-[0.7rem] text-faint hover:text-muted">
          status →
        </Link>
      </header>

      {/* Mic */}
      <section className="flex flex-col items-center gap-5 py-6">
        <button
          type="button"
          onClick={toggleListen}
          disabled={busy || !recognitionSupported}
          aria-label={listening ? 'Stop listening' : 'Start talking'}
          className={[
            'flex h-24 w-24 items-center justify-center rounded-full border transition-colors',
            listening
              ? 'border-verd bg-verd/15 text-verd eden-live'
              : 'border-edge bg-panel text-muted hover:border-verd-dim hover:text-mist',
            busy || !recognitionSupported ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
          ].join(' ')}
        >
          <MicIcon />
        </button>
        <p className="h-5 text-center font-mono text-[0.72rem] uppercase tracking-[0.18em] text-faint">
          {!recognitionSupported
            ? 'voice input not supported here — type below'
            : listening
              ? 'listening… tap to stop'
              : phase === 'thinking'
                ? 'eden is thinking…'
                : phase === 'speaking' || speaking
                  ? 'eden is speaking…'
                  : 'tap to talk'}
        </p>
      </section>

      {/* What you said */}
      {transcript ? (
        <div className="rounded-lg border border-edge-soft bg-panel/50 px-4 py-3">
          <span className="font-mono text-[0.65rem] uppercase tracking-wider text-faint">You</span>
          <p className="mt-1 text-sm text-mist">{transcript}</p>
        </div>
      ) : null}

      {/* Manual play (if autoplay was blocked) */}
      {pendingAudioUrl ? (
        <button
          type="button"
          onClick={() => void playAudio(pendingAudioUrl)}
          className="self-start rounded-md border border-verd-dim bg-verd/10 px-3 py-1.5 font-mono text-xs text-verd"
        >
          ▶ Play Eden&apos;s reply
        </button>
      ) : null}

      {/* Error */}
      {error ? (
        <div className="rounded-lg border border-edge bg-panel/60 px-4 py-3 text-sm text-muted">
          {error}
        </div>
      ) : null}

      {/* Result */}
      {result ? (
        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[0.65rem] uppercase tracking-wider text-faint">Eden</span>
            {statusLabel ? (
              <span className="rounded-full border border-edge px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-wider text-verd">
                {statusLabel}
              </span>
            ) : null}
          </div>

          {result.understanding?.goal ? (
            <p className="text-sm leading-relaxed text-mist">{result.understanding.goal}</p>
          ) : null}

          {Array.isArray(result.results) && result.results.length > 0 ? (
            <ul className="flex flex-col divide-y divide-edge-soft overflow-hidden rounded-lg border border-edge">
              {result.results.map((r, i) => (
                <li key={`${r.name}-${i}`} className="flex flex-col gap-1 bg-panel/50 px-4 py-3">
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

          {result.gate_a?.questions && result.gate_a.questions.length > 0 ? (
            <ul className="flex flex-col gap-1.5">
              {result.gate_a.questions.map((q) => (
                <li key={q.id} className="text-sm text-muted">
                  • {q.text}
                </li>
              ))}
            </ul>
          ) : null}

          {result.note ? (
            <p className="text-xs leading-relaxed text-faint">{result.note}</p>
          ) : null}
        </section>
      ) : null}

      {/* Typed fallback */}
      <div className="mt-auto flex items-center gap-2 border-t border-edge-soft pt-5">
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
      width="28"
      height="28"
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
