create table if not exists environments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  slug text not null,
  kind text not null check (kind in ('ssh','agent','local_agent','docker_host')),
  status text not null default 'active' check (status in ('draft','active','degraded','disabled','archived')),
  host text,
  port integer,
  agent_identifier text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_by uuid references users(id),
  last_seen_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, workspace_id, slug)
);

create index if not exists idx_environments_workspace_created_at
  on environments (workspace_id, created_at desc);

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  environment_id uuid not null references environments(id) on delete cascade,
  name text not null,
  slug text not null,
  root_path text not null,
  source text not null default 'manual' check (source in ('manual','discovered','imported','synced')),
  status text not null default 'active' check (status in ('active','archived','importing','error')),
  metadata_json jsonb not null default '{}'::jsonb,
  created_by uuid references users(id),
  last_synced_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (environment_id, slug),
  unique (environment_id, root_path)
);

create index if not exists idx_projects_workspace_created_at
  on projects (workspace_id, created_at desc);

create index if not exists idx_projects_environment_created_at
  on projects (environment_id, created_at desc);

create table if not exists project_discovery_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  environment_id uuid not null references environments(id) on delete cascade,
  requested_by uuid not null references users(id),
  strategy text not null default 'agent_inventory' check (strategy in ('agent_inventory','ssh_scan','manual')),
  status text not null default 'queued' check (status in ('queued','running','completed','failed','cancelled')),
  request_json jsonb not null default '{}'::jsonb,
  result_json jsonb not null default '{}'::jsonb,
  error_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists idx_project_discovery_requests_environment_created_at
  on project_discovery_requests (environment_id, created_at desc);

alter table chat_sessions add column if not exists environment_id uuid;
alter table chat_sessions add column if not exists project_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'fk_chat_sessions_environment'
  ) then
    alter table chat_sessions
      add constraint fk_chat_sessions_environment
      foreign key (environment_id) references environments(id) on delete set null;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'fk_chat_sessions_project'
  ) then
    alter table chat_sessions
      add constraint fk_chat_sessions_project
      foreign key (project_id) references projects(id) on delete set null;
  end if;
end $$;

create index if not exists idx_chat_sessions_environment_updated_at
  on chat_sessions (environment_id, updated_at desc);

create index if not exists idx_chat_sessions_project_updated_at
  on chat_sessions (project_id, updated_at desc);

alter table runs add column if not exists environment_id uuid;
alter table runs add column if not exists project_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'fk_runs_environment'
  ) then
    alter table runs
      add constraint fk_runs_environment
      foreign key (environment_id) references environments(id) on delete set null;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'fk_runs_project'
  ) then
    alter table runs
      add constraint fk_runs_project
      foreign key (project_id) references projects(id) on delete set null;
  end if;
end $$;

create index if not exists idx_runs_environment_created_at
  on runs (environment_id, created_at desc);

create index if not exists idx_runs_project_created_at
  on runs (project_id, created_at desc);
