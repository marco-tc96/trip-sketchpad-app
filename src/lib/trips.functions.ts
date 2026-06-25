import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const tripInput = z.object({
  title: z.string().min(1).max(120),
  destination: z.string().max(120).optional().nullable(),
  country: z.string().max(80).optional().nullable(),
  countries: z.array(z.string().length(2)).max(20).optional(),
  cities: z
    .array(z.object({ name: z.string().min(1).max(120), country: z.string().length(2) }))
    .max(60)
    .optional(),
  cover_url: z.string().url().max(500).optional().nullable(),
  start_date: z.string(),
  end_date: z.string(),
  local_currency: z.string().length(3),
  fx_rate_fallback: z.number().positive().optional().nullable(),
  timeline_mode: z.enum(["days", "activities"]).default("days"),
  cover_emoji: z.string().max(8).optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
});

export const listTrips = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("trips")
      .select("*")
      .order("start_date", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getTrip = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: trip, error } = await context.supabase
      .from("trips")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!trip) throw new Error("Not found");
    return trip;
  });

export const createTrip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => tripInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("trips")
      .insert({ ...data, user_id: context.userId })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateTrip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: z.string().uuid(), patch: tripInput.partial() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("trips")
      .update(data.patch)
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteTrip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("trips").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });