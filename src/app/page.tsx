/**
 * Eden — Home (system console).
 *
 * A restrained operator surface that confirms Eden is online and shows the
 * system's true structure: the deterministic loop, the three planes, the
 * permission model, the scaffolded modules, and the live API surface. Built to
 * be extended by future dashboards, not to be marketing. Server-rendered.
 *
 * The signature is the loop rail: the lifecycle is genuinely an ordered
 * sequence with two halt gates, so the numbering and the two highlighted gates
 * encode something true rather than decorate.
 */

import { Panel } from '@/components/ui/Panel';
import { StatusDot } from '@/components/ui/StatusDot';
import { SystemStatus } from '@/components/SystemStatus';
import Link from 'next/link';
import { PLANES, MODULES, PERMISSION_LEVELS } from '@/lib/config/constants';

/** The fixed lifecycle (Core Contract §2). Gates are halt points. */
const LOOP: Array<{ key: string; label: string; gate?: boolean }> = [
  { key: '1', label: 'Ingest' },
  { key: '2', label: 'Understand' },
  { key: 'A', label: 'Gate A', gate: true },
  { key: '4', label: 'Plan' },
  { key: '5', label: 'State write' },
  { key: 'B', label: 'Gate B', gate: true },
  { key: '7', label: 'Execute' },
  { key: '8', label: 'Verify' },
  { key: '9', label: 'Commit' },
  { key: '10', label: 'Return' },
];

const ENDPOINTS: Array<{ method: string; path: string; note: string }> = [
  { method: 'GET', path: '/api/health', note: 'Liveness + configured capabilities' },
  { method: 'GET', path: '/api/version', note: 'Build version, commit, runtime' },
  { method: 'POST', path: '/api/eden/run', note: 'Submit intent · understand + Gate A' },
];

const PLANE_TAGS: Record<string, string> = {
  control: 'control',
  reasoning: 'reasoning',
  execution: 'execution',
  memory: 'memory',
};

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-12 sm:py-16">
      <SystemStatus />

      <Link
        href="/assistant"
        className="flex items-center justify-between rounded-lg border border-verd-dim bg-verd/10 px-5 py-4 transition-colors hover:bg-verd/15"
      >
        <span className="flex flex-col">
          <span className="font-mono text-sm text-mist">Talk to Eden</span>
          <span className="mt-0.5 text-xs text-muted">Speak or type a request and hear it answer back.</span>
        </span>
        <span aria-hidden className="font-mono text-verd">→</span>
      </Link>


      {/* Signature: the deterministic loop. */}
      <Panel
        label="Execution lifecycle"
        aside={<span className="font-mono text-[0.7rem]">deterministic · 2 halt gates</span>}
      >
        <ol className="flex items-stretch gap-0 overflow-x-auto pb-1">
          {LOOP.map((node, i) => (
            <li key={`${node.key}-${i}`} className="flex items-center">
              <div className="flex min-w-[4.5rem] flex-col items-center gap-1.5 text-center">
                <span
                  className={[
                    'flex h-8 w-8 items-center justify-center rounded-md border font-mono text-xs',
                    node.gate
                      ? 'border-verd-dim bg-verd/10 text-verd'
                      : 'border-edge bg-ink text-muted',
                  ].join(' ')}
                >
                  {node.key}
                </span>
                <span
                  className={[
                    'font-mono text-[0.62rem] uppercase tracking-wider',
                    node.gate ? 'text-verd' : 'text-faint',
                  ].join(' ')}
                >
                  {node.label}
                </span>
              </div>
              {i < LOOP.length - 1 ? (
                <span aria-hidden className="mx-0.5 h-px w-5 shrink-0 bg-edge sm:w-7" />
              ) : null}
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs leading-relaxed text-faint">
          Every request takes this exact path; only the content differs. The two gates are
          where Eden stops and hands control back — Gate&nbsp;A for ambiguity, Gate&nbsp;B for
          Level&nbsp;3 approval. Halting is a complete outcome; guessing is not.
        </p>
      </Panel>

      <Panel label="Planes" aside={<span className="font-mono text-[0.7rem]">strictly separated</span>}>
        <div className="grid gap-px overflow-hidden rounded-md border border-edge-soft bg-edge-soft sm:grid-cols-3">
          {PLANES.map((plane) => (
            <div key={plane.id} className="flex flex-col gap-2 bg-panel p-4">
              <span className="font-mono text-xs uppercase tracking-wider text-mist">
                {plane.name.replace(' Plane', '')}
              </span>
              <span className="text-xs leading-relaxed text-muted">{plane.responsibility}</span>
              <span className="mt-auto pt-2 text-[0.7rem] leading-relaxed text-faint">
                {plane.boundary}
              </span>
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid gap-8 lg:grid-cols-2">
        <Panel label="Permission model" aside={<span className="font-mono text-[0.7rem]">least privilege</span>}>
          <ul className="flex flex-col divide-y divide-edge-soft">
            {([1, 2, 3] as const).map((level) => {
                const lvl = PERMISSION_LEVELS[level];
                return (
                  <li key={level} className="flex items-baseline gap-3 py-2.5 first:pt-0 last:pb-0">
                    <span className="font-mono text-xs text-verd-dim">L{level}</span>
                    <div className="flex flex-col">
                      <span className="font-mono text-xs uppercase tracking-wider text-mist">
                        {lvl.label}
                      </span>
                      <span className="text-xs text-muted">{lvl.summary}</span>
                    </div>
                    <span className="ml-auto self-center font-mono text-[0.65rem] text-faint">
                      {lvl.approval === 'none' ? 'no approval' : 'approval required'}
                    </span>
                  </li>
                );
              })}
          </ul>
        </Panel>

        <Panel label="API" aside={<StatusDot state="ready" />}>
          <ul className="flex flex-col divide-y divide-edge-soft">
            {ENDPOINTS.map((ep) => (
              <li key={ep.path} className="flex items-baseline gap-3 py-2.5 first:pt-0 last:pb-0">
                <span className="w-10 shrink-0 font-mono text-[0.65rem] text-verd-dim">
                  {ep.method}
                </span>
                <span className="font-mono text-xs text-mist">{ep.path}</span>
                <span className="ml-auto hidden text-right text-[0.7rem] text-faint sm:block">
                  {ep.note}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel
        label="Modules"
        aside={<span className="font-mono text-[0.7rem]">Milestone&nbsp;1 · interfaces scaffolded</span>}
      >
        <div className="grid gap-px overflow-hidden rounded-md border border-edge-soft bg-edge-soft sm:grid-cols-2 lg:grid-cols-4">
          {MODULES.map((m) => (
            <div key={m.id} className="flex flex-col gap-2 bg-panel p-4">
              <div className="flex items-center gap-2">
                <StatusDot state="scaffold" />
                <span className="text-sm text-mist">{m.name}</span>
              </div>
              <span className="font-mono text-[0.65rem] uppercase tracking-wider text-faint">
                {PLANE_TAGS[m.plane] ?? m.plane}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-faint">
          Each module ships a stable interface and pure foundation helpers now. Behaviour —
          orchestration, reasoning, execution, persistence — is implemented across later
          milestones without changing these contracts.
        </p>
      </Panel>

      <footer className="mt-auto flex items-center justify-between border-t border-edge-soft pt-5 font-mono text-[0.7rem] text-faint">
        <span>eden · foundation</span>
        <span>three planes · one work package · append-only memory</span>
      </footer>
    </main>
  );
}
