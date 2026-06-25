ALTER TABLE public.trips
DROP CONSTRAINT IF EXISTS trips_cover_type_check;

ALTER TABLE public.trips
ADD CONSTRAINT trips_cover_type_check
CHECK (cover_type = ANY (ARRAY['auto'::text, 'map'::text, 'photo'::text, 'color'::text]));