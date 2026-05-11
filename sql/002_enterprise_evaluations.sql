create table if not exists enterprise_evaluations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete set null,
  user_id uuid references users(id) on delete set null,
  name text not null,
  email text not null,
  company text not null,
  use_case text not null,
  estimated_seats integer,
  status text not null default 'new' check (status in ('new','contacted','qualified','closed_won','closed_lost')),
  notes_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_enterprise_evaluations_created_at
  on enterprise_evaluations (created_at desc);

create index if not exists idx_enterprise_evaluations_tenant_created_at
  on enterprise_evaluations (tenant_id, created_at desc);
