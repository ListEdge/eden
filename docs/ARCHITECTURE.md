# Eden — Architecture

This document explains how Eden is put together, what Milestone 1 includes, and
the decisions behind the structure. It's written to be read by anyone, not just
engineers; where a technical term is unavoidable, it's defined in plain words.

---

## The core idea

Most AI systems blur three very different jobs together: thinking about what to
do, actually doing it, and remembering what happened. Eden keeps them **strictly
separated** into three "planes," and lets them talk to each other through one
shared object. That separation is the whole point — it's what makes Eden's
behaviour predictable, auditable, and safe to let near real systems.

### The three planes

- **Reasoning Plane** — *cognition.* It decides **what** should happen and
  **why**: it interprets a request, writes a specification, and produces a plan.
  It never touches the outside world and never holds any credentials. Thinking
  has no side effects.

- **Execution Plane** — *action.* It does exactly what it was told, and nothing
  more. It is the only plane that holds tool credentials and the only one that
  changes anything in the real world. It never decides or improvises.

- **Memory Plane** — *truth.* It is the single source of record. It is
  **append-only** (history is added to, never quietly overwritten) and
  **explainable** (every fact knows where it came from).

A useful way to hold it: **Reasoning proposes, a human approves anything risky,
Execution acts, Memory remembers — and the four are kept apart on purpose.**

### The Work Package

The three planes never share loose data. They pass a single, self-describing
object called a **Work Package**. It carries everything about one piece of work:
the original request and the interpreted goal, the spec, the plan, the concrete
actions, the approval status, and the rollback plan. Reasoning produces it,
Memory stores it, Execution consumes it. Because it's complete on its own, any
plane can act on it without reaching back for context.

The Work Package's exact shape lives in
[`src/core/work-package/types.ts`](../src/core/work-package/types.ts) and mirrors
the Core Contract one-for-one.

### The deterministic lifecycle

Every request travels the same fixed path, no matter what it asks for:

```
1 Ingest → 2 Understand → (Gate A) → 4 Plan → 5 State write →
(Gate B) → 7 Execute → 8 Verify → 9 Commit → 10 Return
```

Only the **content** differs between requests; the **path** never does. There
are two halt points where Eden stops and hands control back to a human:

- **Gate A — completeness/ambiguity.** If the request is underspecified or
  ambiguous, Eden stops and asks rather than guessing.
- **Gate B — permission.** Before any action that changes the world (see
  permission levels below), Eden stops for explicit approval.

Stopping at a gate is a **complete, correct outcome** — not a failure. The legal
moves of this lifecycle are encoded as a state machine in
[`src/core/work-package/status.ts`](../src/core/work-package/status.ts), and the
**Orchestrator is the only component allowed to change a Work Package's
status.** That single-writer rule is what keeps the machine deterministic.

### Permission levels

Every action is classified at the **minimum sufficient** level (least
privilege). The classifier may raise a level but never lower it.

| Level | Name      | Examples                          | Approval                  |
| ----- | --------- | --------------------------------- | ------------------------- |
| 1     | READ_ONLY | analyse, explain, suggest         | none                      |
| 2     | PREPARE   | plan, draft, design, stage        | none                      |
| 3     | EXECUTE   | apply, deploy, send, mutate       | explicit, per Work Package |

A Level 3 approval is bound to a **scope fingerprint** — a hash of the
approval-relevant parts of the package. If the package changes after approval,
the fingerprint changes and the approval is automatically void. This is
implemented now in
[`src/core/work-package/schema.ts`](../src/core/work-package/schema.ts)
(`computeScopeFingerprint`).

---

## Module map

The core lives under `src/core/`, one folder per responsibility, each mapped to
a plane:

| Module          | Plane            | Responsibility                                         |
| --------------- | ---------------- | ------------------------------------------------------ |
| `work-package`  | control / spine  | The cross-plane unit of work; state machine; invariants |
| `reasoning`     | Reasoning        | Understand, Gate A, plan, classify, judge              |
| `execution`     | Execution        | Execute actions, roll back, verify                     |
| `tool-registry` | Execution        | Catalogue of tools and their adapters                  |
| `approval`      | control          | Level-3 authorisation bound to the scope fingerprint   |
| `orchestrator`  | control          | Drives the lifecycle; the only writer of status        |
| `memory`        | Memory           | The source of truth: structured, semantic, working     |
| `audit`         | Memory           | The append-only event + reasoning-trace log            |

Supporting foundations live under `src/lib/`: a single typed **error**
hierarchy, a structured **logger**, the HTTP **response envelope** and route
**handler**, **config** (constants + environment), the **AI** provider layer,
and **Supabase** client factories.

### Memory has three layers

Inside the Memory Plane (see
[`src/core/memory/`](../src/core/memory)):

- **Structured** — the system of record: versioned entities (projects, systems,
  tasks, decisions, actor profiles) with mandatory provenance and a strict
  "exactly one active version per identity" rule.
- **Semantic** — knowledge chunks with vector embeddings, retrieved by a tunable
  relevance score that blends similarity with recency, importance, frequency,
  and entity overlap.
- **Working** — the live context for one in-flight Work Package, checkpointed at
  every state transition (which is what makes crash recovery and "resume after a
  block" real), then distilled into long-term memory and evicted when the work
  reaches a terminal state.

One rule cuts across all of memory: **secrets, approval tokens, and unnecessary
personal data are never stored.** A redaction pass runs before any write.

---

## What Milestone 1 includes

**Built and working now:**

- The project scaffold (Next.js App Router, TypeScript, Tailwind v4).
- The complete set of module **interfaces** — the contracts every later
  milestone implements against.
- The Work Package **types**, **zod schema**, **invariant checks**, and
  **acyclic-dependency validation**.
- The **state machine** and its legal-transition rules.
- The **scope fingerprint** for approvals.
- The **provider-agnostic AI layer**, with OpenAI wired in as the first
  provider.
- **Supabase** client factories (browser, server, and admin).
- Three **API routes**: `/api/health`, `/api/version`, `/api/eden/run`.
- The **console UI**.
- The **foundation database migration**.

**Stubbed for later milestones, behind fixed interfaces:** the orchestration
loop, the reasoning stages, tool execution and rollback, and all
database-backed persistence. Each stub throws a clear "not implemented in this
milestone" error — it never fabricates a result.

The boundary is deliberate: M1 proves the *shape* of the system is right and
deployable, without pretending to do work it can't yet do honestly.

---

## Key decisions (and why)

**One deployment now, splittable later.** The target architecture eventually
separates Reasoning, Execution, and Control into physically isolated services
(so, for example, the Reasoning service literally cannot reach a credential).
Milestone 1 runs them as cleanly-separated **modules** inside a single Next.js
deployment. The module boundaries are drawn exactly where the future service
boundaries are, so extracting them later needs **no interface changes** — only
new deployment wiring. This keeps M1 simple and immediately deployable to Vercel
while preserving the long-term design.

**The AI layer is provider-agnostic.** Reasoning depends on a `ReasoningProvider`
interface, not on any one vendor. OpenAI is the first concrete provider; another
(e.g. Anthropic) can be added later with **zero changes to callers**. This
reconciles the immediate "use OpenAI" requirement with the architecture's
broader model-independence.

**Work Package fields are `snake_case`.** The in-memory object, the API payload,
and the database `jsonb` all share one shape, matching the Core Contract's JSON
exactly. That fidelity is intentional and is not "tidied" into the camelCase
that the rest of the TypeScript uses — it removes a whole class of
translation bugs at the boundaries.

**`ROLLBACK_FAILED` is a real state.** The original contract assumed rollback
always succeeds. Production reality says otherwise, so Eden has a dedicated
quarantine state for a rollback that fails — it must never masquerade as a clean
one, and it triggers human escalation.

**Configuration is optional and lazy.** Every environment variable is optional;
the app builds and boots with none set. A credential is only read when the
capability that needs it is used, and a missing one produces a precise
configuration error. Server-only secrets are guarded so they can never reach the
browser.

**The blessed toolchain stays blessed.** The project uses the exact TypeScript
and ESLint versions that ship with the current Next.js scaffold, rather than
forcing newer major versions. "Deployable immediately" is best served by the
officially-supported combination.

**Database invariants live in the database too.** App code checks the rules, but
the database is the last line of defence: the event log has UPDATE/DELETE
revoked (append-only), and row-level security is enabled so tenants are isolated
by default.
