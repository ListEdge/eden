/**
 * Eden — Panel.
 *
 * A raised, hairline-bordered surface with a monospaced eyebrow label. The
 * console's primary structural device; future dashboards compose from it.
 */

import type { ReactNode } from 'react';

export function Panel({
  label,
  aside,
  children,
  className = '',
}: {
  label: string;
  /** Optional right-aligned content in the header row (e.g. a status). */
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-lg border border-edge bg-panel/70 backdrop-blur-sm ${className}`}
    >
      <header className="flex items-center justify-between gap-4 border-b border-edge-soft px-5 py-3">
        <h2 className="font-mono text-[0.7rem] uppercase tracking-[0.22em] text-faint">
          {label}
        </h2>
        {aside ? <div className="text-faint">{aside}</div> : null}
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}
