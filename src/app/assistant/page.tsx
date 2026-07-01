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
interface PlanData {
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
interface RunData {
  conversation_id: string;
  status: string;
  reply: string;
  results?: PlaceResult[];
  plan?: PlanData;
  error?: string;
  audio_base64?: string | null;
  audio_content_type?: string | null;
}

function base64ToBlob(b64: string, type: string): Blob {
  const bytes = atob(b64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i += 1) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type });
}

interface ChatMessage {
  role: 'user' | 'eden';
  text: string;
  results?: PlaceResult[];
  plan?: PlanData;
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
        setMessages((m) => [
          ...m,
          { role: 'eden', text: data.reply, results: data.results, plan: data.plan },
        ]);
        setPhase('idle');
        if (data.audio_base64) {
          const blob = base64ToBlob(data.audio_base64, data.audio_content_type ?? 'audio/mpeg');
          await playAudio(URL.createObjectURL(blob));
        }
      } catch {
        setError('Could not reach Eden. Check your connection and try again.');
        setPhase('idle');
      } finally {
        setBusy(false);
      }
    },
    [busy, conversationId, playAudio],
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
            <div key={i} className="flex flex-col gap-2">
              <div className={msg.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
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
              {msg.plan ? <PlanView plan={msg.plan} /> : null}
            </div>
          ))}
        </section>
      ) : (
        <p className="py-8 text-center text-sm text-muted">
          Talk to Eden about anything — think through an idea, ask a question, or
          <br className="hidden sm:block" /> find somewhere to eat. It remembers the conversation.
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

function PlanField({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-[0.6rem] uppercase tracking-wider text-faint">{label}</span>
      <p className="text-sm leading-relaxed text-mist">{value}</p>
    </div>
  );
}

function PlanView({ plan }: { plan: PlanData }) {
  const s = plan.plan;
  return (
    <div className="flex flex-col gap-5 rounded-lg border border-edge bg-panel/40 px-5 py-5">
      <div className="flex flex-col gap-1">
        <span className="font-mono text-[0.6rem] uppercase tracking-wider text-verd">Plan</span>
        {plan.title ? <h2 className="text-base font-medium text-mist">{plan.title}</h2> : null}
        {plan.concept ? <p className="text-sm leading-relaxed text-muted">{plan.concept}</p> : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <PlanField label="Problem" value={s.problem} />
        <PlanField label="Solution" value={s.solution} />
        <PlanField label="Target customer" value={s.target_customer} />
        <PlanField label="Value proposition" value={s.value_proposition} />
        <PlanField label="Market" value={s.market} />
        <PlanField label="Business model" value={s.business_model} />
        <PlanField label="Go-to-market" value={s.go_to_market} />
        <PlanField label="Competition" value={s.competition} />
        <PlanField label="Risks" value={s.risks} />
      </div>

      {plan.next_steps && plan.next_steps.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-[0.6rem] uppercase tracking-wider text-faint">
            Next steps
          </span>
          <ol className="flex flex-col gap-1">
            {plan.next_steps.map((step, i) => (
              <li key={i} className="text-sm text-mist">
                <span className="text-faint">{i + 1}.</span> {step}
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <div className="flex flex-col gap-2 border-t border-edge-soft pt-4">
        <span className="font-mono text-[0.6rem] uppercase tracking-wider text-verd">Branding</span>
        {plan.branding?.name_ideas && plan.branding.name_ideas.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {plan.branding.name_ideas.map((n, i) => (
              <span
                key={i}
                className="rounded-full border border-edge px-2.5 py-1 text-xs text-mist"
              >
                {n}
              </span>
            ))}
          </div>
        ) : null}
        <PlanField label="Positioning" value={plan.branding?.positioning} />
        <PlanField label="Tone" value={plan.branding?.tone} />
        <PlanField label="Visual direction" value={plan.branding?.visual_direction} />
      </div>
    </div>
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
