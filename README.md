# Eden

**An execution-first AI operating system.** Eden turns a plain-language request
into governed, traceable, optionally-deployable work: it understands intent,
plans, asks for approval when an action would change the real world, executes,
verifies, and records every step so the whole thing can be explained after the
fact.

This repository is **Milestone 1 — the foundation.** It is not a prototype to be
thrown away; it is the permanent base that later milestones build on. M1 ships
the full architectural skeleton — every module's interface, the deterministic
state machine, the database foundation, the API surface, and a status console —
with the pure, safe-to-ship logic implemented and the heavier behaviour
(reasoning, execution, persistence) stubbed behind stable contracts.

> **A note on the name.** The architecture documents this was built from are
> titled "Jarvis." The project is **Eden** throughout, so that is the name used
> everywhere in the code. If it should be Jarvis instead, it's a quick rename.

---

## What's in the box

- **Three strictly-separated planes** — Reasoning (decides), Execution (acts),
  Memory (remembers). They communicate only through one shared object.
- **The Work Package** — the single, self-describing unit of work that crosses
  plane boundaries: intent, plan, actions, approval, and rollback all travel
  together.
- **A deterministic lifecycle** — every request follows the same fixed path with
  two halt points: Gate A (stops on ambiguity) and Gate B (stops for approval
  before anything irreversible).
- **A typed foundation that already works** — the state machine, Work Package
  validation and invariants, and the approval "scope fingerprint" are
  implemented and tested by the type checker now.
- **Append-only memory** — the database enforces that the event log can't be
  edited or deleted, and that tenants can't see each other's data.

For the full picture, read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Run it locally

You'll need **Node 22** (see `.nvmrc`).

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. You'll see the Eden console reporting that the
system is online, with the lifecycle, planes, permission model, and modules laid
out. It runs with **no configuration at all** — every credential is optional.

Useful checks:

```bash
npm run typecheck   # TypeScript, no emit
npm run lint        # ESLint
npm run build       # production build
```

---

## Deploy it (GitHub → Vercel)

Eden is a standard Next.js app and deploys to Vercel with no special setup. The
short version:

1. Push this repository to GitHub.
2. In Vercel, **Add New → Project**, and import the repo. Accept the Next.js
   defaults and deploy.
3. (Optional, when you want database + AI features) add the environment
   variables from `.env.example` in **Project → Settings → Environment
   Variables**, then run the SQL in `supabase/migrations/0001_init.sql` using the
   Supabase SQL editor.

Step-by-step instructions are in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md), and
every environment variable is explained in
[`docs/ENVIRONMENT.md`](docs/ENVIRONMENT.md).

---

## API surface

| Method | Path              | What it does                                            |
| ------ | ----------------- | ------------------------------------------------------- |
| `GET`  | `/api/health`     | Liveness, plus which capabilities are configured.       |
| `GET`  | `/api/version`    | Build version, git commit, and runtime.                 |
| `POST` | `/api/eden/run`   | Submit a request in plain English. Interprets it, stores it with a full audit trail, and either parks it at `SPECIFIED` or halts at `BLOCKED_ON_INPUT` with clarifying questions. Needs Supabase + OpenAI configured. |

---

## Project layout

```
src/
  app/                Next.js App Router (pages + API routes)
    api/              health · version · eden/run
  components/         console UI (Panel, StatusDot, SystemStatus)
  core/               the system itself — one module per responsibility
    work-package/     the cross-plane unit of work (+ state machine, invariants)
    reasoning/        cognition: understand · gate A · plan · classify · judge
    execution/        action: execute · rollback · verify
    tool-registry/    the catalogue of tools the Execution plane may use
    approval/         Level-3 authorisation, bound to a scope fingerprint
    orchestrator/     drives the state machine — the only writer of status
    memory/           the single source of truth (structured · semantic · working)
    audit/            the append-only event + reasoning-trace log
  lib/                foundations: errors, logging, http, config, ai, supabase
supabase/migrations/  the database foundation (SQL)
docs/                 architecture, deployment, environment, milestones
```

---

## What is and isn't implemented in M1

**Implemented now:** project scaffold; the full module interface set; the Work
Package types, zod schema, invariant checks, and acyclic-dependency validation;
the state machine and its legal-transition rules; the approval scope fingerprint;
the provider-agnostic AI layer (with OpenAI wired in); Supabase client
factories; the three API routes; the console UI; and the foundation database
migration.

**Stubbed for later milestones (behind fixed interfaces):** the orchestration
loop, the reasoning stages, tool execution and rollback, and all
database-backed persistence. Calling any of these fails loudly with a clear
"not implemented in this milestone" error rather than pretending to work.

See [`docs/MILESTONES.md`](docs/MILESTONES.md) for the roadmap.
