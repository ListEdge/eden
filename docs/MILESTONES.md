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
  last scaffolded to validate input and return `501`, writing nothing).
- The **console UI** showing live system status.
- The **foundation database migration**: identity/tenancy, requests, the Work
  Package status type, `work_packages`, and the append-only `events` log — with
  append-only enforcement and deny-by-default row-level security.

Everything behavioural beyond the pure helpers is stubbed behind these
interfaces and fails loudly rather than fabricating results.

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
