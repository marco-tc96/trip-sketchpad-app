import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const ITEM_KINDS = [
  "outbound","return","flight","train","bus","car","taxi","moto","ferry","transfer",
  "lodging","activity","zone","other","metro","tram",
] as const;

// Item kinds that can carry transport legs (meta.legs / meta.mixed_legs) —
// used by listTransportItems below to power the Profile page's transport
// statistics (uses per vehicle, top line/route/station, km travelled).
const TRANSPORT_KINDS = [
  "outbound", "return", "flight", "train", "bus", "car", "taxi", "moto", "ferry", "transfer", "metro", "tram",
] as const;

const waypointSchema = z.object({
  name: z.string().max(160),
  enter: z.boolean().optional(),
  // Coordinates captured when the city is picked from suggestions, so the map
  // places it precisely without an ambiguous name lookup.
  lat: z.number().optional().nullable(),
  lng: z.number().optional().nullable(),
  country: z.string().max(2).optional().nullable(),
});

const legSchema = z.object({
  // Per-leg transport mode (multi-modal journeys). Falls back to meta.mode.
  mode: z.enum(["car", "moto", "train", "plane", "ferry", "bus", "metro", "tram"]).optional().nullable(),
  from: z.string().max(160).optional().nullable(),
  to: z.string().max(160).optional().nullable(),
  depart_at: z.string().optional().nullable(),
  arrive_at: z.string().optional().nullable(),
  carrier: z.string().max(120).optional().nullable(),
  number: z.string().max(40).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  // Road legs (car/moto): city stops to visit, used to shape the drawn route.
  waypoints: z.array(waypointSchema).max(12).optional().nullable(),
});

const metaSchema = z
  .object({
    mode: z.enum(["car", "moto", "train", "plane", "ferry", "bus", "metro", "tram"]).optional(),
    legs: z.array(legSchema).max(20).optional(),
  })
  .passthrough();

const itemInput = z.object({
  trip_id: z.string().uuid(),
  kind: z.enum(ITEM_KINDS),
  title: z.string().min(1).max(160),
  location: z.string().max(160).optional().nullable(),
  start_at: z.string().optional().nullable(),
  end_at: z.string().optional().nullable(),
  day_index: z.number().int().optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
  position: z.number().int().default(0),
  meta: metaSchema.optional(),
});

export const listItems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ trip_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("itinerary_items")
      .select("*")
      .eq("trip_id", data.trip_id)
      .order("start_at", { ascending: true, nullsFirst: false })
      .order("position", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => itemInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("itinerary_items")
      .insert({ ...data, meta: (data.meta ?? {}) as never, user_id: context.userId })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

const itemPatch = itemInput.partial().omit({ trip_id: true });
export const updateItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: z.string().uuid(), patch: itemPatch }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const patch = { ...data.patch } as Record<string, unknown>;
    if (patch.meta !== undefined) patch.meta = patch.meta ?? {};
    const { data: row, error } = await context.supabase
      .from("itinerary_items")
      .update(patch as never)
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("itinerary_items")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Returns every transport-carrying itinerary item (kind + meta + trip_id)
 * for the current user, across ALL of their trips. Used by the Profile
 * page to build cross-trip transport statistics (vehicle usage counts,
 * top line/route/station, distance travelled per mode). Callers filter
 * by trip_id client-side (e.g. to keep only past/ongoing trips, mirroring
 * the rest of the Profile stats) since this function intentionally stays
 * trip-agnostic to avoid an extra join here.
 */
export const listTransportItems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("itinerary_items")
      .select("trip_id, kind, meta")
      .eq("user_id", context.userId)
      .in("kind", TRANSPORT_KINDS as unknown as string[]);
    if (error) throw new Error(error.message);
    return (data ?? []) as { trip_id: string; kind: string; meta: unknown }[];
  });
