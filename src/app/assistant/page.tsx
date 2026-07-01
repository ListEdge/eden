'use client';

/**
 * Eden — the operating system surface.
 *
 * A holographic, JARVIS-style console. Eden sits at the center as a living 3D
 * neural core. Tap it to wake: the core docks to the top and the cockpit
 * assembles beneath it. Speak (Web Speech API) or type in the dock; Eden
 * remembers the conversation, speaks its replies (via /api/eden/run), and pulls
 * rich output — business plans, place results — up as floating panels.
 *
 * The conversational core, voice, and plans are live. System Status, Active
 * Projects and System Metrics are indicative for now — they become real as
 * those subsystems are built.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import './os.css';

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

interface ChatMessage {
  role: 'user' | 'eden';
  text: string;
  results?: PlaceResult[];
  plan?: PlanData;
}

type FloatContent =
  | { kind: 'project'; name: string; sub: string }
  | { kind: 'plan'; plan: PlanData }
  | { kind: 'results'; title: string; results: PlaceResult[] };

type CoreMode = 'idle' | 'listening' | 'thinking' | 'working';
type V3 = [number, number, number];

const PROJECTS: { name: string; sub: string }[] = [
  { name: 'ListEdge', sub: 'Conjunctional sales network' },
  { name: 'Website Studio', sub: 'Client sites' },
  { name: 'Klyne Real Estate', sub: 'CRM + listings' },
];

function base64ToBlob(b64: string, type: string): Blob {
  const bytes = atob(b64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i += 1) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type });
}

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

function wave(base: number, freq: number, phase: number): number[] {
  return Array.from(Array(24).keys()).map((i) => Math.round(base + Math.sin(i * freq + phase) * 8));
}

export default function AssistantPage() {
  const recognitionSupported = useMemo(() => getRecognitionCtor() !== null, []);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const coreRef = useRef<HTMLCanvasElement | null>(null);
  const modeRef = useRef<CoreMode>('idle');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const feedRef = useRef<HTMLDivElement | null>(null);

  const [awake, setAwake] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [listening, setListening] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingAudioUrl, setPendingAudioUrl] = useState<string | null>(null);
  const [floatContent, setFloatContent] = useState<FloatContent | null>(null);
  const [clock, setClock] = useState('');
  const [metrics, setMetrics] = useState<number[][]>([
    wave(42, 0.7, 0),
    wave(61, 0.55, 1),
    wave(78, 0.5, 2),
  ]);

  const mode: CoreMode = listening
    ? 'listening'
    : busy
      ? 'thinking'
      : speaking
        ? 'working'
        : 'idle';

  /* keep the animation loop's mode in sync without re-running the effect */
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  /* lock scrolling while the OS is mounted */
  useEffect(() => {
    const htmlEl = document.documentElement;
    const prevHtml = htmlEl.style.overflow;
    const prevBody = document.body.style.overflow;
    htmlEl.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    return () => {
      htmlEl.style.overflow = prevHtml;
      document.body.style.overflow = prevBody;
    };
  }, []);

  /* clock */
  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString('en-GB'));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  /* ambient metrics — flow the sparklines over time */
  useEffect(() => {
    const bases = [42, 61, 78];
    const jitter = (b: number) => Math.max(8, Math.min(96, b + (Math.random() * 22 - 11)));
    const id = window.setInterval(() => {
      setMetrics((prev) =>
        prev.map((arr, k) => {
          const next = arr.slice(1);
          next.push(jitter(bases[k]));
          return next;
        }),
      );
    }, 1700);
    return () => window.clearInterval(id);
  }, []);

  /* auto-scroll the conversation feed */
  useEffect(() => {
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  /* ---- the 3D neural core (runs once, client-only) ---- */
  useEffect(() => {
    const canvas = coreRef.current;
    if (!canvas) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let raf = 0;
    let renderer: THREE.WebGLRenderer | null = null;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(560, 560, false);

      const scene = new THREE.Scene();
      scene.fog = new THREE.Fog(0x03060d, 3.4, 7.6);
      const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
      camera.position.z = 5.3;
      const group = new THREE.Group();
      scene.add(group);

      // soft radial glow sprite
      const size = 64;
      const cv = document.createElement('canvas');
      cv.width = cv.height = size;
      const g = cv.getContext('2d');
      if (g) {
        const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        gr.addColorStop(0, 'rgba(210,248,255,1)');
        gr.addColorStop(0.4, 'rgba(70,205,255,.6)');
        gr.addColorStop(1, 'rgba(30,120,220,0)');
        g.fillStyle = gr;
        g.fillRect(0, 0, size, size);
      }
      const tex = new THREE.CanvasTexture(cv);

      // fibonacci-sphere nodes
      const N = 340;
      const R = 1.78;
      const pos: V3[] = [];
      for (let i = 0; i < N; i += 1) {
        const y = 1 - (i / (N - 1)) * 2;
        const r = Math.sqrt(1 - y * y);
        const th = Math.PI * (3 - Math.sqrt(5)) * i;
        const jt = 0.88 + Math.random() * 0.24;
        pos.push([Math.cos(th) * r * R * jt, y * R * jt, Math.sin(th) * r * R * jt]);
      }
      const pg = new THREE.BufferGeometry();
      pg.setAttribute('position', new THREE.Float32BufferAttribute(pos.flat(), 3));
      group.add(
        new THREE.Points(
          pg,
          new THREE.PointsMaterial({
            size: 0.125,
            map: tex,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            fog: true,
            color: 0x9af0ff,
          }),
        ),
      );

      // neural connections
      const seg: number[] = [];
      const edges: [V3, V3][] = [];
      let c = 0;
      for (let i = 0; i < N && c < 880; i += 1) {
        for (let j = i + 1; j < N && c < 880; j += 1) {
          const a = pos[i];
          const b = pos[j];
          const dx = a[0] - b[0];
          const dy = a[1] - b[1];
          const dz = a[2] - b[2];
          if (dx * dx + dy * dy + dz * dz < 0.34) {
            seg.push(a[0], a[1], a[2], b[0], b[1], b[2]);
            edges.push([a, b]);
            c += 1;
          }
        }
      }
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
      group.add(
        new THREE.LineSegments(
          lg,
          new THREE.LineBasicMaterial({
            color: 0x1e9bff,
            transparent: true,
            opacity: 0.2,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            fog: true,
          }),
        ),
      );

      // faint containment shell
      group.add(
        new THREE.LineSegments(
          new THREE.WireframeGeometry(new THREE.SphereGeometry(2.12, 22, 16)),
          new THREE.LineBasicMaterial({
            color: 0x2f8fd8,
            transparent: true,
            opacity: 0.05,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            fog: true,
          }),
        ),
      );

      // travelling data pulses
      const PULSES = 16;
      const pulseGeo = new THREE.BufferGeometry();
      const pp = new Float32Array(PULSES * 3);
      pulseGeo.setAttribute('position', new THREE.BufferAttribute(pp, 3));
      const pulses: { e: [V3, V3]; t: number; sp: number }[] = [];
      for (let i = 0; i < PULSES; i += 1) {
        pulses.push({
          e: edges.length ? edges[(Math.random() * edges.length) | 0] : [pos[0], pos[1]],
          t: Math.random(),
          sp: 0.006 + Math.random() * 0.01,
        });
      }
      group.add(
        new THREE.Points(
          pulseGeo,
          new THREE.PointsMaterial({
            size: 0.2,
            map: tex,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            fog: true,
            color: 0xffffff,
          }),
        ),
      );

      // luminous core
      const spr = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: tex,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      spr.scale.set(2.7, 2.7, 1);
      group.add(spr);

      const MAP: Record<CoreMode, [number, number, number, number]> = {
        idle: [0.0021, 0.03, 0.72, 1],
        listening: [0.0022, 0.075, 0.9, 1.4],
        thinking: [0.007, 0.05, 1.05, 2.4],
        working: [0.004, 0.04, 0.95, 1.8],
      };
      const S = { rot: 0.0021, amp: 0.03, glow: 0.72, spark: 1 };
      let t = 0;

      const loop = () => {
        t += 0.004;
        const v = MAP[modeRef.current] ?? MAP.idle;
        S.rot += (v[0] - S.rot) * 0.05;
        S.amp += (v[1] - S.amp) * 0.05;
        S.glow += (v[2] - S.glow) * 0.05;
        S.spark += (v[3] - S.spark) * 0.05;
        group.rotation.y += S.rot;
        group.rotation.x = Math.sin(t) * 0.16;
        const sc = 1 + Math.sin(t * 1.7) * S.amp;
        group.scale.set(sc, sc, sc);
        spr.material.opacity = S.glow * 0.72 + Math.sin(t * 1.7) * 0.12;
        for (let i = 0; i < PULSES; i += 1) {
          const p = pulses[i];
          p.t += p.sp * S.spark;
          if (p.t >= 1) {
            p.e = edges.length ? edges[(Math.random() * edges.length) | 0] : p.e;
            p.t = 0;
          }
          const a = p.e[0];
          const b = p.e[1];
          pp[i * 3] = a[0] + (b[0] - a[0]) * p.t;
          pp[i * 3 + 1] = a[1] + (b[1] - a[1]) * p.t;
          pp[i * 3 + 2] = a[2] + (b[2] - a[2]) * p.t;
        }
        pulseGeo.attributes.position.needsUpdate = true;
        renderer!.render(scene, camera);
        raf = requestAnimationFrame(loop);
      };
      loop();
    } catch {
      /* WebGL unavailable — the CSS fallback glow remains visible */
    }

    return () => {
      if (raf) cancelAnimationFrame(raf);
      if (renderer) renderer.dispose();
    };
  }, []);

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
      setPendingAudioUrl(url);
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
          return;
        }
        const data = json.data as RunData;
        setConversationId(data.conversation_id);
        setMessages((m) => [
          ...m,
          { role: 'eden', text: data.reply, results: data.results, plan: data.plan },
        ]);
        if (data.plan) {
          setFloatContent({ kind: 'plan', plan: data.plan });
        } else if (data.results && data.results.length > 0) {
          setFloatContent({ kind: 'results', title: 'Results', results: data.results });
        }
        if (data.audio_base64) {
          const blob = base64ToBlob(data.audio_base64, data.audio_content_type ?? 'audio/mpeg');
          await playAudio(URL.createObjectURL(blob));
        }
      } catch {
        setError('Could not reach Eden. Check your connection and try again.');
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
    setFloatContent(null);
  }, []);

  const wake = useCallback(() => {
    setAwake(true);
    window.setTimeout(() => inputRef.current?.focus(), 700);
  }, []);

  const sleep = useCallback(() => {
    if (audioRef.current) audioRef.current.pause();
    setFloatContent(null);
    setAwake(false);
  }, []);

  const taskLabel = busy
    ? 'Processing your request'
    : speaking
      ? 'Speaking'
      : listening
        ? 'Listening'
        : messages.length === 0
          ? 'Awaiting your first instruction'
          : 'Ready';

  return (
    <div className={cx('edenos', awake ? 'awake' : 'dormant', floatContent && 'focused')}>
      <div className="amb">
        <div className="glow g1" />
        <div className="glow g2" />
        <div className="glow g3" />
      </div>
      <div className="gridbg" />
      <div className="scan" />

      {/* the living core */}
      <div
        className="brain"
        onClick={() => (awake ? sleep() : wake())}
        role="button"
        aria-label={awake ? 'Put Eden to sleep' : 'Wake Eden'}
      >
        <div className="core-fallback" />
        <canvas id="core" ref={coreRef} />
        <div className="tick" />
        <div className="rings">
          <div className="rg a" />
          <div className="rg b" />
          <div className="rg c" />
        </div>
      </div>

      <div className="wake-hint" onClick={wake}>
        <div className="t">EDEN</div>
        <div className="s">tap the core to wake</div>
      </div>

      {/* top bar */}
      <div className="topbar">
        <div className="tb-l">
          <div className="v">
            EDEN<b>.</b>
          </div>
          <div className="statepill">
            <i />
            <span>{mode}</span>
          </div>
          {messages.length > 0 ? (
            <button type="button" className="newchat" onClick={newConversation}>
              New chat
            </button>
          ) : null}
        </div>
        <div className="clock">
          {clock}
          <span className="dt">Christchurch</span>
        </div>
      </div>

      {/* cockpit */}
      <div className="os">
        <div className="content">
          {/* LEFT */}
          <div className="col">
            <div className="panel">
              <div className="p-h">System Status</div>
              <div className="p-body">
                <div className="srow">
                  <span className="lbl">Core Systems</span>
                  <span className="val">
                    <i />
                    Online
                  </span>
                </div>
                <div className="srow">
                  <span className="lbl">Memory</span>
                  <span className="val">
                    <i />
                    Stable
                  </span>
                </div>
                <div className="srow">
                  <span className="lbl">Reasoning</span>
                  <span className="val">
                    <i />
                    Online
                  </span>
                </div>
                <div className="srow">
                  <span className="lbl">Execution</span>
                  <span className="val warn">
                    <i />
                    Standby
                  </span>
                </div>
                <div className="srow">
                  <span className="lbl">Tool Registry</span>
                  <span className="val">
                    <i />
                    Online
                  </span>
                </div>
                <div className="srow">
                  <span className="lbl">Voice</span>
                  <span className="val">
                    <i />
                    {recognitionSupported ? 'Online' : 'Type only'}
                  </span>
                </div>
              </div>
            </div>

            <div className="panel">
              <div className="p-h">Active Projects</div>
              <div className="p-body">
                {PROJECTS.map((p) => (
                  <div
                    key={p.name}
                    className="proj"
                    onClick={() => setFloatContent({ kind: 'project', name: p.name, sub: p.sub })}
                  >
                    <span className="nm">
                      <span className="d" />
                      {p.name}
                    </span>
                    <span className="badge">Active</span>
                  </div>
                ))}
                <button
                  type="button"
                  className="newp"
                  onClick={() => {
                    if (!awake) wake();
                    inputRef.current?.focus();
                  }}
                >
                  + New Project
                </button>
              </div>
            </div>
          </div>

          {/* CENTER */}
          <div className="col">
            <div className="panel">
              <div className="p-h">Current Task</div>
              <div className="p-body">
                <div className="task-txt">{taskLabel}</div>
                <div className="pill">
                  <i />
                  {mode}
                </div>
                <div className="hintline">
                  Eden turns intent into governed work. Ask a question, think through an idea, or
                  find somewhere to eat — it keeps the thread.
                </div>
              </div>
            </div>

            <div className="panel">
              <div className="p-h">Conversation Feed</div>
              <div className="p-body">
                <div className="feedscroll" ref={feedRef}>
                  {messages.length === 0 ? (
                    <p className="empty">
                      No conversation yet. Tap the mic or type below to begin — Eden is listening.
                    </p>
                  ) : (
                    messages.map((m, i) => (
                      <div key={i} className={cx('fr', m.role === 'user' ? 'u' : 'e')}>
                        <div className="av" />
                        <div>
                          <div className="who">{m.role === 'user' ? 'You' : 'Eden'}</div>
                          <div className="tx">{m.text}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT */}
          <div className="col">
            <div className="panel">
              <div className="p-h">System Metrics</div>
              <div className="p-body">
                <Metric label="Reasoning load" data={metrics[0]} />
                <Metric label="Memory" data={metrics[1]} />
                <Metric label="Network" data={metrics[2]} />
              </div>
            </div>

            <div className="panel">
              <div className="p-h">Quick Commands</div>
              <div className="p-body">
                <div className="qc">
                  <button
                    type="button"
                    onClick={() => {
                      if (!awake) wake();
                      inputRef.current?.focus();
                    }}
                  >
                    <span className="ic">+</span>New task
                  </button>
                  <button type="button" onClick={() => void submit('Find good restaurants near me')}>
                    <span className="ic">◈</span>Restaurants near me
                  </button>
                  <button
                    type="button"
                    onClick={toggleListen}
                    disabled={!recognitionSupported || busy}
                  >
                    <span className="ic">◉</span>Voice command
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* floating panel */}
      <div className="float-wrap">
        <div className="float">
          {floatContent ? (
            <FloatBody
              content={floatContent}
              onClose={() => setFloatContent(null)}
              onFocusInput={() => {
                setFloatContent(null);
                inputRef.current?.focus();
              }}
            />
          ) : null}
        </div>
      </div>

      {error ? <div className="errbar">{error}</div> : null}

      {/* dock */}
      <div className="dock">
        <div className="dock-inner">
          <input
            ref={inputRef}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onTypedSubmit();
            }}
            placeholder={busy ? 'Eden is thinking…' : 'Message Eden…'}
            disabled={busy}
          />
          {pendingAudioUrl ? (
            <button
              type="button"
              className="send"
              title="Play Eden's reply"
              onClick={() => void playAudio(pendingAudioUrl)}
            >
              ▶
            </button>
          ) : null}
          <div className="wave">
            {Array.from({ length: 24 }).map((_, i) => (
              <i
                key={i}
                style={{
                  animationDelay: `${i * 0.05}s`,
                  opacity: listening || speaking || busy ? 0.9 : 0.4,
                }}
              />
            ))}
          </div>
          <button
            type="button"
            className="send"
            onClick={onTypedSubmit}
            disabled={busy || !typed.trim()}
            aria-label="Send"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="13 6 19 12 13 18" />
            </svg>
          </button>
          <button
            type="button"
            className={cx('mic', listening && 'on')}
            onClick={toggleListen}
            disabled={busy || !recognitionSupported}
            aria-label={listening ? 'Stop listening' : 'Talk to Eden'}
          >
            <svg viewBox="0 0 24 24">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="22" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, data }: { label: string; data: number[] }) {
  const n = data.length;
  const pts = data
    .map((v, i) => {
      const x = (i / (n - 1)) * 100;
      const y = 24 - Math.max(2, Math.min(22, (v / 100) * 24));
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <div className="met">
      <div className="met-top">
        <span className="l">{label}</span>
        <span className="n">{Math.round(data[n - 1])}%</span>
      </div>
      <svg className="spark" viewBox="0 0 100 24" preserveAspectRatio="none">
        <polyline className="fillp" points={`0,24 ${pts} 100,24`} />
        <polyline points={pts} />
      </svg>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="f">
      <label>{label}</label>
      <p>{value}</p>
    </div>
  );
}

function FloatBody({
  content,
  onClose,
  onFocusInput,
}: {
  content: FloatContent;
  onClose: () => void;
  onFocusInput: () => void;
}) {
  if (content.kind === 'project') {
    return (
      <>
        <div className="fh">
          <div className="cap">Project</div>
          <button type="button" className="fx" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <h2>{content.name}</h2>
        <div className="sub">{content.sub} · Active</div>
        <div className="fstats">
          <div className="fstat">
            <div className="k">Status</div>
            <div className="val">Active</div>
          </div>
          <div className="fstat">
            <div className="k">Stage</div>
            <div className="val">Live</div>
          </div>
          <div className="fstat">
            <div className="k">Health</div>
            <div className="val">Good</div>
          </div>
        </div>
        <div className="frow">
          <span className="k">Workspace</span>
          <span className="v">Coming soon</span>
        </div>
        <div className="frow">
          <span className="k">Linked memory</span>
          <span className="v">Enabled</span>
        </div>
        <div className="factions">
          <button type="button" onClick={onClose}>
            Close
          </button>
          <button type="button" className="solid" onClick={onFocusInput}>
            Ask Eden about this
          </button>
        </div>
      </>
    );
  }

  if (content.kind === 'results') {
    return (
      <>
        <div className="fh">
          <div className="cap">Places</div>
          <button type="button" className="fx" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <h2>Found {content.results.length}</h2>
        <div className="sub">Nearby, ranked by relevance</div>
        <div className="placelist">
          {content.results.map((r, i) => (
            <div className="placeitem" key={`${r.name}-${i}`}>
              <div className="pn">
                <span className="pname">{r.name}</span>
                {typeof r.distanceMeters === 'number' ? (
                  <span className="pdist">{(r.distanceMeters / 1000).toFixed(1)} km</span>
                ) : null}
              </div>
              {r.address ? <div className="paddr">{r.address}</div> : null}
              {r.website ? (
                <a href={r.website} target="_blank" rel="noopener noreferrer">
                  website →
                </a>
              ) : null}
            </div>
          ))}
        </div>
        <div className="factions">
          <button type="button" className="solid" onClick={onClose}>
            Done
          </button>
        </div>
      </>
    );
  }

  const p = content.plan;
  const s = p.plan;
  return (
    <>
      <div className="fh">
        <div className="cap">Plan</div>
        <button type="button" className="fx" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      {p.title ? <h2>{p.title}</h2> : null}
      {p.concept ? <p className="plan-lead">{p.concept}</p> : null}
      <div className="fields">
        <Field label="Problem" value={s.problem} />
        <Field label="Solution" value={s.solution} />
        <Field label="Customer" value={s.target_customer} />
        <Field label="Value" value={s.value_proposition} />
        <Field label="Market" value={s.market} />
        <Field label="Model" value={s.business_model} />
        <Field label="Go-to-market" value={s.go_to_market} />
        <Field label="Competition" value={s.competition} />
        <Field label="Risks" value={s.risks} />
      </div>
      {p.next_steps && p.next_steps.length > 0 ? (
        <div className="steps">
          {p.next_steps.map((step, i) => (
            <div className="st" key={i}>
              <b>{i + 1}</b>
              {step}
            </div>
          ))}
        </div>
      ) : null}
      {p.branding?.name_ideas && p.branding.name_ideas.length > 0 ? (
        <div className="names">
          {p.branding.name_ideas.map((nm, i) => (
            <span key={i}>{nm}</span>
          ))}
        </div>
      ) : null}
      <div className="factions">
        <button type="button" onClick={onClose}>
          Close
        </button>
        <button type="button" className="solid" onClick={onFocusInput}>
          Refine with Eden
        </button>
      </div>
    </>
  );
}
