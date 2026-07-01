-- ============================================================================
-- Eden — Migration 0004: projects
--
-- A Project is a persistent workspace for a piece of work: it wraps a
-- conversation thread (so resuming a project continues Eden's memory of it) and
-- optionally stores a saved business plan. This is the foundation for Eden
-- working across many parallel efforts.
--
-- Run after 0003. Safe to paste into the Supabase SQL editor. Idempotent.
-- ============================================================================

create table if not exists projects (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id),
  principal_id    uuid not null references principals(id),
  conversation_id uuid references conversations(id),
  title           text not null,
  summary         text not null default '',
  status          text not null default 'active' check (status in ('active', 'archived')),
  plan            jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Most-recently-updated first, per tenant.
create index if not exists projects_tenant_updated_idx
  on projects (tenant_id, updated_at desc);

-- RLS deny-by-default, consistent with earlier migrations (the service-role
-- client used by the server bypasses RLS; per-user policies arrive with auth).
alter table projects enable row level security;

-- ============================================================================
-- End migration 0004.
-- ============================================================================
