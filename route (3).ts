/**
 * Eden — SystemStatus.
 *
 * The console masthead: the wordmark, a live status readout (the page's
 * signature pulse), the release label, and the one-line statement of what Eden
 * is. Server-rendered; values come from app constants.
 */

import { StatusDot } from '@/components/ui/StatusDot';
import { APP_NAME, APP_TAGLINE, EDEN_VERSION } from '@/lib/config/constants';

export function SystemStatus() {
  return (
    <header className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-2xl font-medium tracking-tight text-mist">
            {APP_NAME.toLowerCase()}
          </span>
          <span className="font-mono text-xs text-faint">v{EDEN_VERSION}</span>
        </div>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">
          {APP_TAGLINE}. It turns intent into governed, traceable, optionally-deployable work.
        </p>
      </div>

      <div className="flex items-center gap-2.5 self-start rounded-full border border-edge bg-panel/70 px-3.5 py-1.5 sm:self-auto">
        <StatusDot state="live" />
        <span className="font-mono text-[0.7rem] uppercase tracking-[0.22em] text-verd">
          Eden online
        </span>
      </div>
    </header>
  );
}
