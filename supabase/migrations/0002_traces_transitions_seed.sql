-- ============================================================================
-- Eden — Migration 0002: reasoning traces, status transitions, and a seed
--
-- Adds the two audit tables the running loop writes to, and a fixed "system"
-- identity to act as until real authentication and tenancy arrive. Run this
-- after 0001_init.sql.
--
-- Both new tables are append-only (UPDATE/DELETE revoked for the app roles) and
-- have row-level security enabled deny-by-default, consistent with 0001.
--
-- Safe to paste into the Supabase SQL editor. Idempotent.
-- ============================================================================

-- Reasoning traces: one row per model decision (the "why" behind an event) ---
create table if not exists reasoning_traces (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id),
  work_package_id uuid references work_packages(id),
  stage           text not null,   -- UNDERSTAND | GATE_A | PLAN | CLASSIFY | VERIFY
  model           text not null,
  prompt_hash     text not null,   -- hash of the prompt, never the prompt itself
  input           jsonb not null default '{}',
  output          jsonb not null default '{}',
  rationale       text,
  created_at      timestamptz not null default now()
);
create index if not exists reasoning_traces_wp_idx     on reasoning_traces (work_package_id);
create index if not exists reasoning_traces_tenant_idx on reasoning_traces (tenant_id);

-- Status transitions: the audited record of every state change ---------------
create table if not exists status_transitions (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id),
  work_package_id uuid not null references work_packages(id),
  from_status     wp_status,            -- null only for the initial creation
  to_status       wp_status not null,
  trigger         text not null,
  actor           text not null,
  guard_context   jsonb not null default '{}',
  created_at      timestamptz not null default now()
);
create index if not exists status_transitions_wp_idx
  on status_transitions (work_package_id, created_at);

-- Append-only enforcement for the new audit tables (Build Spec §3.1) ---------
revoke update, delete on reasoning_traces   from anon, authenticated;
revoke update, delete on status_transitions from anon, authenticated;

-- RLS deny-by-default; per-tenant policies arrive with auth (Build Spec R11) --
alter table reasoning_traces   enable row level security;
alter table status_transitions enable row level security;

-- Pre-auth seed identity -----------------------------------------------------
-- Server-side intake runs as this fixed tenant + principal until authentication
-- lands. These exact UUIDs are mirrored in src/lib/config/constants.ts; keep
-- them in sync. Not secret. Removed once real auth + tenancy exist.
insert into tenants (id, name)
values ('00000000-0000-4000-8000-000000000001', 'Eden System (pre-auth)')
on conflict (id) do nothing;

insert into principals (id, tenant_id, type, display_name)
values (
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000001',
  'service',
  'Eden System Principal'
)
on conflict (id) do nothing;

-- ============================================================================
-- End migration 0002.
-- ============================================================================
