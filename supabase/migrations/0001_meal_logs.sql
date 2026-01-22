-- Create meal_logs table
CREATE TABLE IF NOT EXISTS meal_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now() NOT NULL,
  meal_time timestamptz NOT NULL,
  raw_text text NOT NULL,
  meal_type text,
  totals jsonb NOT NULL,
  items jsonb NOT NULL,
  confidence double precision NOT NULL DEFAULT 0.5,
  assumptions text[] DEFAULT '{}'::text[]
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_meal_logs_meal_time_desc ON meal_logs(meal_time DESC);
CREATE INDEX IF NOT EXISTS idx_meal_logs_created_at_desc ON meal_logs(created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE meal_logs ENABLE ROW LEVEL SECURITY;

-- Note: No policies are created since client does not query DB directly.
-- All access goes through Edge Functions using service role key.
