-- ============================================================
-- KalTrack v2: settings, daily templates, water tracking
-- ============================================================

-- ----- User settings (goals + preferences), single-row table -----
create table if not exists user_settings (
  id integer primary key default 1 check (id = 1),
  calories_goal integer not null default 2500,
  protein_goal_g numeric(6,1) not null default 180,
  carbs_goal_g numeric(6,1) not null default 250,
  fat_goal_g numeric(6,1) not null default 80,
  fiber_goal_g numeric(6,1) not null default 30,
  sugar_goal_g numeric(6,1),
  sodium_goal_mg numeric(7,1),
  water_goal_oz numeric(5,1) not null default 64,
  timezone text not null default 'America/Chicago',
  updated_at timestamptz not null default now()
);

insert into user_settings (id) values (1) on conflict do nothing;

-- ----- Daily meal templates ("dailies") -----
create table if not exists daily_templates (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  aliases text[] not null default '{}',
  calories integer not null default 0,
  protein_g numeric(6,1) not null default 0,
  carbs_g numeric(6,1) not null default 0,
  fat_g numeric(6,1) not null default 0,
  fiber_g numeric(6,1) not null default 0,
  sugar_g numeric(6,1),
  sodium_mg numeric(7,1),
  is_active boolean not null default true,
  sort_order integer not null default 0
);

create index if not exists idx_daily_templates_sort on daily_templates (sort_order, created_at);

-- ----- Water logs -----
create table if not exists water_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  logged_at timestamptz not null default now(),
  amount_oz numeric(5,1) not null,
  note text
);

create index if not exists idx_water_logs_logged_at_desc on water_logs (logged_at desc);

-- ----- Link a meal_log back to the template that created it (optional) -----
alter table meal_logs add column if not exists template_id uuid references daily_templates(id) on delete set null;

-- ============================================================
-- Grants (so the service role / API roles can read & write)
-- This is what was missing and caused "permission denied".
-- ============================================================
grant usage on schema public to service_role, anon, authenticated;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;

-- RLS on (service role bypasses it; enable policies later if you add auth)
alter table user_settings enable row level security;
alter table daily_templates enable row level security;
alter table water_logs enable row level security;
