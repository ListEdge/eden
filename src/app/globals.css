@import "tailwindcss";

/*
 * Eden — console theme.
 *
 * A calm, governed operator surface: a deep ink ground with a green undertone
 * (a quiet nod to "Eden"), off-white text, and a single verdigris accent used
 * only for live/active state. Geist Mono carries the system-label texture;
 * Geist Sans sets the few headings. Tokens below are exposed to Tailwind via
 * @theme so they read as utilities (bg-ink, text-mist, border-edge, text-verd).
 */

:root {
  --ink: #0e1311;        /* page ground */
  --panel: #141a18;      /* raised surface */
  --edge: #232c29;       /* hairline borders */
  --edge-soft: #1b2220;  /* fainter rules */
  --mist: #e7ebe9;       /* primary text */
  --muted: #8a938f;      /* secondary text */
  --faint: #5e6864;      /* tertiary / captions */
  --verd: #6fbf9b;       /* accent: live + active markers */
  --verd-dim: #3c5a4e;   /* accent, recessed */
}

@theme inline {
  --color-ink: var(--ink);
  --color-panel: var(--panel);
  --color-edge: var(--edge);
  --color-edge-soft: var(--edge-soft);
  --color-mist: var(--mist);
  --color-muted: var(--muted);
  --color-faint: var(--faint);
  --color-verd: var(--verd);
  --color-verd-dim: var(--verd-dim);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

body {
  background: var(--ink);
  color: var(--mist);
  font-family: var(--font-geist-sans), system-ui, sans-serif;
  /* faint structural grid — present, never loud */
  background-image:
    linear-gradient(to right, var(--edge-soft) 1px, transparent 1px),
    linear-gradient(to bottom, var(--edge-soft) 1px, transparent 1px);
  background-size: 64px 64px;
  background-position: center top;
}

/* the live pulse — the one moving element. respects reduced motion. */
@keyframes eden-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.35; transform: scale(0.82); }
}

.eden-live {
  animation: eden-pulse 2.4s ease-in-out infinite;
}

@media (prefers-reduced-motion: reduce) {
  .eden-live {
    animation: none;
  }
}
