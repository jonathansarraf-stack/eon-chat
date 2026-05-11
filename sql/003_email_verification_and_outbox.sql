create table if not exists email_verification_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  email text not null,
  verification_token_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_email_verification_tokens_user_created_at
  on email_verification_tokens (user_id, created_at desc);

create table if not exists email_outbox (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  to_email text not null,
  subject text not null,
  template text not null,
  payload_json jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','sent','failed','cancelled')),
  scheduled_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_email_outbox_status_scheduled_at
  on email_outbox (status, scheduled_at asc);
