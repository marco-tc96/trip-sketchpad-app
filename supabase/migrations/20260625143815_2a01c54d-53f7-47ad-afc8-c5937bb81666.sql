ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS cover_type text NOT NULL DEFAULT 'auto'
    CHECK (cover_type IN ('auto','map','photo'));