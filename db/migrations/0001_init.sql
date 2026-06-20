-- Lynx Phase 0 schema. RLS by company_id throughout.

create extension if not exists "uuid-ossp";

create table companies (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  api_key_hash text not null unique,
  created_at timestamptz not null default now()
);

create table identities (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references companies(id) on delete cascade,
  label text not null,
  email text,
  phone text,
  payment_token text,
  fingerprint_json jsonb,
  storage_state_url text,
  created_at timestamptz not null default now()
);
create index on identities (company_id);

create table playbooks (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references companies(id) on delete cascade,
  domain text not null,
  version int not null default 1,
  steps_json jsonb not null,
  success_rate float not null default 0,
  updated_at timestamptz not null default now(),
  unique (company_id, domain, version)
);
create index on playbooks (company_id, domain);

create table runs (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references companies(id) on delete cascade,
  identity_id uuid references identities(id),
  goal text not null,
  status text not null default 'queued',
  started_at timestamptz,
  finished_at timestamptz,
  cost_usd numeric(10,4) not null default 0,
  video_url text,
  created_at timestamptz not null default now()
);
create index on runs (company_id, created_at desc);

create table actions (
  id uuid primary key default uuid_generate_v4(),
  run_id uuid not null references runs(id) on delete cascade,
  idx int not null,
  type text not null,
  payload_json jsonb not null,
  screenshot_url text,
  ts timestamptz not null default now(),
  unique (run_id, idx)
);

create table spend_log (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references companies(id) on delete cascade,
  run_id uuid references runs(id) on delete set null,
  kind text not null,
  amount_usd numeric(10,6) not null,
  ts timestamptz not null default now()
);
create index on spend_log (company_id, ts desc);

-- RLS
alter table identities enable row level security;
alter table playbooks enable row level security;
alter table runs enable row level security;
alter table actions enable row level security;
alter table spend_log enable row level security;

create policy tenant_isolation_identities on identities
  using (company_id::text = current_setting('lynx.company_id', true));
create policy tenant_isolation_playbooks on playbooks
  using (company_id::text = current_setting('lynx.company_id', true));
create policy tenant_isolation_runs on runs
  using (company_id::text = current_setting('lynx.company_id', true));
create policy tenant_isolation_actions on actions
  using (
    exists (
      select 1 from runs r
      where r.id = actions.run_id
        and r.company_id::text = current_setting('lynx.company_id', true)
    )
  );
create policy tenant_isolation_spend on spend_log
  using (company_id::text = current_setting('lynx.company_id', true));
