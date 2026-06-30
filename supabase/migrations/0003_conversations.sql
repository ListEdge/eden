-- ============================================================================
-- Eden — Migration 0003: conversation memory
--
-- Gives Eden a memory of the back-and-forth so follow-ups resolve in context
-- ("what about Thai instead?", "which is closest?"). A conversation groups many
-- turns; each turn is one message (yours or Eden's). Turns are append-only.
--
-- Run after 0002. Safe to paste into the Supabase SQL editor. Idempotent.
-- ============================================================================

create table if not exists conversations (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id),
  principal_id uuid not null references principals(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists conversations_tenant_idx on conversations (tenant_id);

create table if not exists conversation_turns (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id),
  tenant_id       uuid not null references tenants(id),
  role            text not null check (role in ('user', 'assistant')),
  content         text not null,
  data            jsonb not null default '{}',
  work_package_id uuid references work_packages(id),
  created_at      timestamptz not null default now()
);
create index if not exists conversation_turns_convo_idx
  on conversation_turns (conversation_id, created_at);

-- Turns are append-only (Core Contract Rule 4 spirit: memory is added to, not rewritten).
revoke update, delete on conversation_turns from anon, authenticated;

-- RLS deny-by-default, consistent with earlier migrations.
alter table conversations      enable row level security;
alter table conversation_turns enable row level security;

-- ============================================================================
-- End migration 0003.
-- ============================================================================
