import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const ITEM_KINDS = [
  "outbound","return","flight","train","car","moto","ferry","transfer",
  "lodging","activity","zone","other",
] as const;

const legSchema = z.object({
  from: z.string().max(160).optional().nullable(),
  to: z.string().max(160).optional().nullable(),
  depart_at: z.string().optional().nullable(),
  arrive_at: z.string().optional().nullable(),
  carrier: z.string().max(120).optional().nullable(),
  number: z.string().max(40).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

const metaSchema = z
  .object({
    mode: z.enum(["car", "moto", "train", "plane", "ferry"]).optional(),
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
      .insert({ ...data, user_id: context.userId })
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