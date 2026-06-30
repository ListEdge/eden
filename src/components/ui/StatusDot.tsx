/**
 * Eden — StatusDot.
 *
 * A small, honest state marker. `live` is the verdigris accent that pulses
 * (the one moving element on the page); `ready` marks an implemented surface;
 * `scaffold` marks an interface that exists but whose behaviour lands in a
 * later milestone. Each carries a non-color label via `title` for accessibility.
 */

type DotState = 'live' | 'ready' | 'scaffold';

const STYLES: Record<DotState, { className: string; label: string }> = {
  live: { className: 'bg-verd eden-live', label: 'online' },
  ready: { className: 'bg-verd', label: 'ready' },
  scaffold: { className: 'bg-verd-dim', label: 'scaffolded' },
};

export function StatusDot({
  state = 'ready',
  className = '',
}: {
  state?: DotState;
  className?: string;
}) {
  const s = STYLES[state];
  return (
    <span
      role="img"
      aria-label={s.label}
      title={s.label}
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${s.className} ${className}`}
    />
  );
}
