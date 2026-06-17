-- ============================================================
-- KalTrack v3: workout tracking
-- ============================================================

create table if not exists workout_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  workout_time timestamptz not null default now(),
  raw_text text not null,
  -- items: [{ name, muscle_groups[], sets, reps, weight, weight_unit, duration_min, calories }]
  items jsonb not null default '[]',
  -- totals: { total_sets, total_reps, total_volume, calories, muscles[] }
  totals jsonb not null default '{}',
  confidence double precision not null default 1.0,
  assumptions text[] not null default '{}'
);

create index if not exists idx_workout_logs_time_desc on workout_logs (workout_time desc);

-- Grants (service role full access; matches the rest of the schema)
grant all privileges on workout_logs to service_role;
alter table workout_logs enable row level security;
