ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS trip_type text NOT NULL DEFAULT 'vacation';
ALTER TABLE public.trips DROP CONSTRAINT IF EXISTS trips_trip_type_check;
ALTER TABLE public.trips ADD CONSTRAINT trips_trip_type_check CHECK (trip_type = ANY (ARRAY['vacation'::text, 'business'::text]));