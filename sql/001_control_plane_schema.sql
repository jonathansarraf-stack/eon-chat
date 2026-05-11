-- Eon Chat control plane schema
-- Target database: PostgreSQL
-- Created: 2026-04-25

create extension if not exists "pgcrypto";

create table if not exists plans (
  id text primary key,
  name text not null,
  is_active boolean not null default true,
  seat_limit integer,
  workspace_limit integer,
  monthly_run_limit integer,
  monthly_cost_limit_cents integer,
  features_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  status text not null default 'active' check (status in ('trialing','active','past_due','suspended','cancelled')),
  plan_id text references plans(id),
  owner_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text,
  password_hash text,
  global_role text not null default 'user' check (global_role in ('user','support_admin','platform_admin')),
  email_verified_at timestamptz,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'fk_tenants_owner_user'
  ) then
    alter table tenants
      add constraint fk_tenants_owner_user
      foreign key (owner_user_id) references users(id);
  end if;
end $$;

create table if not exists user_auth_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  provider text not null,
  provider_subject text not null,
  created_at timestamptz not null default now(),
  unique (provider, provider_subject)
);

create table if not exists user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  session_token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  ip_address inet,
  user_agent text
);

create table if not exists tenant_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null check (role in ('owner','admin','billing_admin','developer','viewer')),
  status text not null default 'active' check (status in ('invited','active','suspended','removed')),
  invited_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create table if not exists tenant_invites (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin','billing_admin','developer','viewer')),
  invite_token_hash text not null unique,
  invited_by uuid not null references users(id),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists runtime_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  name text not null,
  sandbox_strategy text not null check (sandbox_strategy in ('container','microvm','worker')),
  network_policy text not null default 'restricted' check (network_policy in ('restricted','allowlist','open')),
  filesystem_policy_json jsonb not null default '{}'::jsonb,
  execution_policy_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists workspaces (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  slug text not null,
  runtime_profile_id uuid references runtime_profiles(id),
  created_by uuid references users(id),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, slug)
);

create table if not exists workspace_memberships (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null check (role in ('workspace_admin','editor','viewer')),
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create table if not exists provider_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  workspace_id uuid references workspaces(id) on delete cascade,
  provider text not null check (provider in ('claude_code','codex')),
  mode text not null check (mode in ('platform_managed','byok')),
  display_name text not null,
  status text not null default 'active' check (status in ('draft','active','disabled','invalid')),
  encrypted_secret_ref text,
  secret_last_rotated_at timestamptz,
  config_json jsonb not null default '{}'::jsonb,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_provider_accounts_default_scope
  on provider_accounts (tenant_id, coalesce(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid), provider, display_name);

create table if not exists chat_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references users(id),
  provider_account_id uuid references provider_accounts(id),
  title text not null default 'New chat',
  status text not null default 'active' check (status in ('active','archived','failed')),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references chat_sessions(id) on delete cascade,
  role text not null check (role in ('system','user','assistant','tool')),
  content_json jsonb not null,
  error_code text,
  created_at timestamptz not null default now()
);

create index if not exists idx_chat_messages_session_created_at
  on chat_messages (session_id, created_at);

create table if not exists runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  session_id uuid not null references chat_sessions(id) on delete cascade,
  provider_account_id uuid references provider_accounts(id),
  provider text not null check (provider in ('claude_code','codex')),
  model text not null,
  status text not null default 'queued' check (status in ('queued','running','completed','failed','cancelled','timed_out')),
  sandbox_id text,
  started_at timestamptz,
  finished_at timestamptz,
  cost_usd numeric(12,6),
  token_usage_json jsonb not null default '{}'::jsonb,
  execution_stats_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_runs_workspace_created_at
  on runs (workspace_id, created_at desc);

create table if not exists run_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references runs(id) on delete cascade,
  seq integer not null,
  type text not null,
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (run_id, seq)
);

create table if not exists billing_customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references tenants(id) on delete cascade,
  stripe_customer_id text not null unique,
  stripe_subscription_id text unique,
  status text not null default 'inactive',
  current_period_ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists billing_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete set null,
  stripe_event_id text not null unique,
  event_type text not null,
  payload_json jsonb not null,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists api_keys_audit (
  id uuid primary key default gen_random_uuid(),
  provider_account_id uuid not null references provider_accounts(id) on delete cascade,
  actor_user_id uuid references users(id),
  event_type text not null check (event_type in ('created','validated','rotated','deleted','disabled')),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  actor_user_id uuid references users(id),
  action text not null,
  target_type text not null,
  target_id text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_tenant_created_at
  on audit_logs (tenant_id, created_at desc);

insert into plans (id, name, seat_limit, workspace_limit, monthly_run_limit, monthly_cost_limit_cents, features_json)
values
  ('starter', 'Starter', 3, 3, 300, 5000, '{"providers":["claude_code","codex"],"byok":true}'::jsonb),
  ('pro', 'Pro', 15, 20, 5000, 50000, '{"providers":["claude_code","codex"],"byok":true,"platform_managed":true}'::jsonb),
  ('enterprise', 'Enterprise', null, null, null, null, '{"providers":["claude_code","codex"],"byok":true,"platform_managed":true,"sso":true}'::jsonb)
on conflict (id) do update set
  name = excluded.name,
  seat_limit = excluded.seat_limit,
  workspace_limit = excluded.workspace_limit,
  monthly_run_limit = excluded.monthly_run_limit,
  monthly_cost_limit_cents = excluded.monthly_cost_limit_cents,
  features_json = excluded.features_json,
  updated_at = now();
