ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS countries text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS cities jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS cover_url text;