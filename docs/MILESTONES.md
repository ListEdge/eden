# Eden — Milestones

This is the roadmap. Milestone 1 is the foundation in this repository; the later
milestones add behaviour on top of it, **without changing the interfaces M1
establishes.** Each milestone is independently shippable and testable.

The phases below follow the engineering build plan the architecture defines.

---

## ✅ Milestone 1 — Foundation (this repository)

The permanent base: structure, contracts, and the safe-to-ship logic.

**Delivered:**

- Project scaffold — Next.js (App Router), TypeScript, Tailwind v4 — deployable
  to Vercel with zero configuration.
- The complete set of **module interfaces** for every plane: reasoning,
  execution, tool-registry, approval, orchestrator, memory, audit, and the
  work-package engine.
- The **Work Package**: full types, a zod validation schema, the Core Contract
  invariant checks, and acyclic-dependency (DAG) validation.
- The **state machine**: every legal transition, with terminal and blocked
  states, as pure data + pure functions.
- The **approval scope fingerprint** — the hash that binds an approval to an
  exact package and voids it automatically if the package changes.
- A **provider-agnostic AI layer** with OpenAI wired in as the first provider.
- **Supabase** client factories (browser, server, admin), all lazy and optional.
- Three **API routes**: `/api/health`, `/api/version`, and `/api/eden/run` (the
  last scaffolded in M1, then made live in M2 — see below).
- The **console UI** showing live system status.
- The **foundation database migration**: identity/tenancy, requests, the Work
  Package status type, `work_packages`, and the append-only `events` log — with
  append-only enforcement and deny-by-default row-level security.

Everything behavioural beyond the pure helpers is stubbed behind these
interfaces and fails loudly rather than fabricating results.

---

## ✅ Milestone 2 — First live intake (read-only)

The first real pass through the loop. `POST /api/eden/run` now does genuine
work for the safest kind of request, end to end, with a full audit trail. This
is a **vertical slice** — it implements the front of the loop by drawing the
first pieces from Phase 0 (Memory) and Phase 1 (Reasoning) below, rather than
completing either phase in full.

**Delivered:**

- **Real persistence to Supabase** (via the service-role client, ahead of auth):
  the Memory Plane now implements `createRequest`, `openWorkPackage`,
  `saveSpecification`, `transition`, `appendEvent`, and `recordTrace`.
- **A real reasoning step**: `understand` calls the configured model through the
  provider abstraction and returns a schema-validated interpretation; `gateA`
  applies a deterministic completeness check.
- **The state machine, driven for real**: the Orchestrator opens a Work Package
  at `RECEIVED`, records the reasoning trace, saves the specification, and
  transitions `RECEIVED → SPECIFIED` (or `SPECIFIED → BLOCKED_ON_INPUT` when the
  request is ambiguous) — and it is the only writer of status.
- **Two new audit tables** (`reasoning_traces`, `status_transitions`),
  append-only, plus a seeded pre-auth system identity (migration `0002`).

**The behaviour you can see:** a clear request is understood and parked at
`SPECIFIED` with its goal, constraints, and assumptions stored; a vague request
**halts at Gate A** as `BLOCKED_ON_INPUT` with clarifying questions, instead of
guessing. Planning and execution remain stubbed.

**Still stubbed:** `writeWorkPackage` (planning-time persistence) and
`getWorkPackage` (the trace-returning read), plus everything in Phases 2–5.

---

## ✅ Milestone 3 — First real tool (place search)

Eden's first genuine **action**: finding real restaurants/venues near a
location. The same request that was understood-and-filed in M2 now drives the
**full read-only loop** and returns live results.

**Delivered:**

- **A swappable place-search layer** (`src/lib/places`): a `PlaceSearchProvider`
  interface with **Geoapify** as the first provider, plus a registry — Google
  Places etc. can be added later by changing one environment variable, exactly
  like the reasoning provider.
- **A real Tool Registry** (`src/core/tool-registry`): an in-memory registry
  with register / get / list, replacing the M1 stub.
- **The `places.search` tool** (`src/core/tools`): a Level-1 (read-only)
  ToolAdapter that finds restaurants near a location, optionally narrowed by
  cuisine, delegating to the configured provider.
- **Place-intent extraction** in Reasoning: a tolerant, heuristic-backed step
  that decides whether a request wants to find a place and pulls out the cuisine
  and any stated location.
- **The execution path, driven for real**: for a place request the Orchestrator
  builds a one-action plan and walks the real state machine
  `SPECIFIED → PLANNED → EXECUTING → VERIFYING → COMPLETED`, logging a
  `TOOL_CALL` event. A missing location halts at `BLOCKED_ON_INPUT`; a tool
  failure transitions to `FAILED`. Non-place requests still park at `SPECIFIED`.

**The behaviour you can see:** "Find an Italian restaurant near \<area\>" comes
back `COMPLETED` with a real list of places; "Italian dinner tonight" with no
area (and no default set) halts and asks where to look.

**Still stubbed:** the booking/reservation action, voice, general-purpose
planning, approvals (no Level-3 tool yet), and Phases 2–5.

---

## ✅ Milestone 4 — Voice & a real interface

Eden gets a face and a voice. No more pasting JSON into an API tool.

**Delivered:**

- **A real Eden page** at `/assistant`: tap the mic and speak, or type. It shows
  what you said, what Eden understood, and the results — and plays a spoken
  reply. Linked from the home console.
- **Speech in** uses the browser's built-in Web Speech API (free, no key); the
  typed input is the fallback where speech isn't supported, so the page works
  everywhere.
- **Speech out** via a swappable speech layer (`src/lib/speech`) with
  **ElevenLabs** as the first provider, plus a registry — another engine can be
  added by changing one environment variable.
- **The `/api/eden/speak` endpoint**: turns text into audio server-side and
  streams it to the browser, so the ElevenLabs key never reaches the client.

**The behaviour you can see:** say "I want Italian food for dinner tonight," and
Eden runs the loop, lists real restaurants on screen, and reads the top few back
to you out loud.

**Still stubbed:** hands-free / real-time conversation (this is press-to-talk),
the booking action, general-purpose planning, approvals, and Phases 2–5.

---

## ✅ Milestone 5 — Conversational memory

Eden remembers the back-and-forth, so it stops feeling like a command box and
starts feeling like an assistant.

**Delivered:**

- **Conversation memory** (`conversations`, `conversation_turns` — migration
  `0003`): every turn (yours and Eden's) is stored, append-only, and the recent
  turns are loaded as context on each new request.
- **Context-aware reasoning**: UNDERSTAND and the place-intent step now receive
  the recent conversation, so references resolve — "what about Thai?" reuses the
  earlier area; "which is closest?" refers to the list just given.
- **A grounded conversational reply** (`reasoning.converse`): when a turn isn't a
  fresh place search, Eden answers from the conversation context only — it won't
  invent facts, and it says plainly that it can't yet take real-world actions
  (booking, calling) when asked.
- **A real chat interface**: `/assistant` is now a back-and-forth conversation
  with a "new chat" reset, each reply spoken aloud.

**The behaviour you can see:** "Italian dinner tonight" → a list; "what about
Thai instead?" → a new list in the same area; "which is the closest?" → Eden
names it from the list it just gave you.

**Still stubbed:** real-world actions (booking/calling/emailing), hands-free
real-time voice, general-purpose planning beyond place search, approvals (no
Level-3 tool yet), and Phases 2–5.

---

## ✅ Milestone 6 — Open-ended conversation

Eden becomes a genuine assistant you can talk to about anything — not just
restaurants — while keeping its ability to take the find-a-place action.

**Delivered:**

- **A capable conversational persona** (`reasoning.converse`): Eden can reason,
  brainstorm, explain, give advice, and help you think, grounded in the
  conversation. It stays honest about its limits — it won't claim to book, call,
  email, access your accounts, or read live data, and it won't invent real-time
  facts.
- **Sharper action routing**: the find-a-place tool now fires only when you
  actually want to *go* somewhere ("find Thai nearby"), not when you're merely
  discussing or asking advice ("I'm thinking of opening a restaurant") — the
  model makes that call, with keyword heuristics only as a fallback.

**The behaviour you can see:** ask Eden to think through a business idea, explain
something, or draft a message, and it just talks with you — but say "find me a
coffee nearby" and it still runs the real search.

**Still stubbed:** real-world actions (booking/calling/emailing), hands-free
real-time voice, general planning beyond place search, approvals, Phases 2–5.

---

## Phase 0 — Memory & the spine

Make the source of truth real. Build the full database schema with its invariant
triggers and row-level-security policies; implement the Memory API and the
append-only event log; add authentication and tenancy.

*Done when:* events and reasoning traces are provably append-only (edits and
deletes are rejected by the database), and illegal status transitions are
rejected by the database trigger.

---

## Phase 1 — Reasoning, read-only (Level 1)

Bring cognition online for safe, read-only work. Implement Understanding, Gate
A, and a Planner that produces packages containing only `read` actions. No
execution service yet.

*Done when:* a request produces a fully-stored, fully-traced Level 1 package, and
a deliberately vague request correctly halts at Gate A with clarifying
questions.

---

## Phase 2 — Planner & clarification loop

Full planning. Add decomposition into multiple packages, dependency-graph
validation, the deterministic Classifier rule table, the scope fingerprint in
the live flow, and the clarification answer/resume cycle.

*Done when:* a plan containing a dependency cycle is rejected; answering a
clarification bumps the package version and re-plans; and the classifier never
assigns a permission level below the rule-table minimum.

---

## Phase 3 — Execution & approval

Let Eden act — carefully. Stand up the Execution service with isolated
credentials, the Approval service with role-based authority, idempotent action
execution (so a retry can't double-apply), and the machine Verifier. Integrate
the first couple of reversible tools.

*Done when:* a Level 3 package cannot reach execution without a valid,
scope-matched approval (checked in both the app and the database), and
re-issuing an already-completed action does not run it twice.

---

## Phase 4 — Failure & rollback

Make failure safe. Implement the Rollback engine (undoing actions in reverse
order), resuming from a tool-unavailable block, the full set of failure states
including `ROLLBACK_FAILED`, and cancelling mid-execution.

*Done when:* an induced action failure rolls back cleanly; an induced rollback
failure quarantines the package and escalates to a human; and a tool disabled
mid-run blocks the package and later resumes from the last success.

---

## Phase 5 — Production hardening

Make it robust at scale. Add resource leases (so two packages can't corrupt a
shared resource), cost and recursion limits, a time-to-live reaper for stuck
packages, observability dashboards, secrets rotation, and the judgment-based
Verifier for criteria that need reasoning rather than a simple check.

*Done when:* concurrent packages touching a shared resource serialise correctly,
per-tenant budgets are enforced, and any package can be fully reconstructed from
the event log alone.
