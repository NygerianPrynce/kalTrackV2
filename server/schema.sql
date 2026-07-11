-- KalTrack schema for Neon (plain Postgres, single user, no RLS)
create extension if not exists pgcrypto;

create table if not exists meal_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  meal_time timestamptz not null default now(),
  raw_text text not null,
  meal_type text,
  totals jsonb not null default '{}',
  items jsonb not null default '[]',
  confidence double precision not null default 1.0,
  assumptions text[] not null default '{}',
  template_id uuid
);
create index if not exists idx_meal_logs_meal_time_desc on meal_logs (meal_time desc);

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

create table if not exists water_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  logged_at timestamptz not null default now(),
  amount_oz numeric(5,1) not null,
  note text
);
create index if not exists idx_water_logs_logged_at_desc on water_logs (logged_at desc);

create table if not exists workout_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  workout_time timestamptz not null default now(),
  raw_text text not null,
  items jsonb not null default '[]',
  totals jsonb not null default '{}',
  confidence double precision not null default 1.0,
  assumptions text[] not null default '{}'
);
create index if not exists idx_workout_logs_time_desc on workout_logs (workout_time desc);
