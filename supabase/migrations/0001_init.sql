-- ============================================================================
-- Eden — Migration 0001: foundation schema
--
-- A deliberate SUBSET of the full data model (Build Spec §3), chosen so the
-- foundation is real and correct while later migrations extend it without
-- rework. Included now: identity + tenancy, requests, the Work Package status
-- enum, work_packages, and the append-only event log.
--
-- Two architectural invariants are enforced at the database here, as the last
-- line of defence (Build Spec §3.1, Core Contract Rule 4):
--   • Events are append-only — UPDATE/DELETE are revoked for the app roles.
--   • Tenant isolation — RLS is enabled (deny-by-default) on tenant-scoped
--     tables; per-tenant policies are added with auth in a later migration.
--
-- Safe to paste into the Supabase SQL editor. Idempotent where practical.
-- ============================================================================

-- Extensions ----------------------------------------------------------------
create extension if not exists pgcrypto;   -- gen_random_uuid()

-- Identity & tenancy --------------------------------------------------------
create table if not exists tenants (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

create table if not exists principals (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id),
  type         text not null check (type in ('human','service')),
  display_name text not null,
  created_at   timestamptz not null default now()
);
create index if not exists principals_tenant_idx on principals (tenant_id);

-- Requests (Stage 1 INGEST — captured intent, immutable) --------------------
create table if not exists requests (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id),
  principal_id   uuid not null references principals(id),
  raw_text       text not null,
  channel        text,
  correlation_id uuid not null default gen_random_uuid(),
  received_at    timestamptz not null default now()
);
create index if not exists requests_tenant_idx on requests (tenant_id);

-- Work Package status (closed set; ROLLBACK_FAILED is Δ CONTRACT, see R4) ----
do $$
begin
  if not exists (select 1 from pg_type where typname = 'wp_status') then
    create type wp_status as enum (
      'RECEIVED','SPECIFIED','PLANNED','AWAITING_APPROVAL','APPROVED',
      'EXECUTING','VERIFYING','COMPLETED',
      'BLOCKED_ON_INPUT','BLOCKED_ON_TOOL','FAILED','ROLLED_BACK',
      'ROLLBACK_FAILED','CANCELLED'
    );
  end if;
end$$;

-- Work Packages -------------------------------------------------------------
-- Document-shaped fields (intent/spec/plan) are jsonb so the package reads as
-- one object; normalised child tables (actions, approvals, outputs, …) arrive
-- in later migrations to enforce per-row invariants.
create table if not exists work_packages (
  id                        uuid primary key default gen_random_uuid(),
  tenant_id                 uuid not null references tenants(id),
  request_id                uuid not null references requests(id),
  parent_id                 uuid references work_packages(id),
  version                   int  not null default 1,
  status                    wp_status not null default 'RECEIVED',
  permission_level          int  not null default 1 check (permission_level between 1 and 3),
  intent                    jsonb not null,
  spec                      jsonb,
  plan                      jsonb,
  scope_fingerprint         text,
  irreversible_acknowledged boolean not null default false,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
create index if not exists work_packages_status_idx  on work_packages (status);
create index if not exists work_packages_request_idx on work_packages (request_id);
create index if not exists work_packages_tenant_idx  on work_packages (tenant_id);

-- Append-only event log (global ordering via identity column) ---------------
create table if not exists events (
  seq             bigint generated always as identity primary key,
  tenant_id       uuid not null,
  work_package_id uuid,
  action_id       uuid,
  type            text not null,   -- STATE_TRANSITION | TOOL_CALL | APPROVAL_GRANTED | ...
  payload         jsonb not null default '{}',
  reasoning_ref   uuid,
  actor           text not null,   -- module name or principal id
  created_at      timestamptz not null default now()
);
create index if not exists events_wp_seq_idx on events (work_package_id, seq);
create index if not exists events_tenant_idx  on events (tenant_id);

-- ── Invariant: events are append-only (Build Spec §3.1, Rule 4) ────────────
-- Revoke mutation for the roles the app authenticates as. The service role
-- retains rights for migrations/admin, but application code must never use it
-- to alter the log.
revoke update, delete on events from anon, authenticated;

-- ── Invariant: tenant isolation (Build Spec R11) ───────────────────────────
-- Enable RLS now so the default posture is deny-by-default for anon/
-- authenticated (no policy = no rows). Per-tenant policies keyed on the
-- authenticated principal are added when auth + tenancy land (Phase 0).
-- Server-side reads in Milestone 1 use the service role, which bypasses RLS.
alter table tenants        enable row level security;
alter table principals     enable row level security;
alter table requests       enable row level security;
alter table work_packages  enable row level security;
alter table events         enable row level security;

-- ============================================================================
-- End migration 0001.
-- ============================================================================
