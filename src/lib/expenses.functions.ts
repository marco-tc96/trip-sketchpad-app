import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const EXPENSE_CATEGORIES = [
  "transport","lodging","food","souvenir","activity","other",
] as const;

const expenseInput = z.object({
  trip_id: z.string().uuid(),
  itinerary_item_id: z.string().uuid().optional().nullable(),
  category: z.enum(EXPENSE_CATEGORIES),
  title: z.string().max(160).optional().nullable(),
  amount: z.number().finite(),
  currency: z.string().length(3),
  amount_home: z.number().finite().optional().nullable(),
  home_currency: z.string().length(3).optional().nullable(),
  fx_rate: z.number().positive().optional().nullable(),
  spent_on: z.string().optional().nullable(),
  note: z.string().max(2000).optional().nullable(),
});

export const listExpenses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ trip_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("expenses")
      .select("*")
      .eq("trip_id", data.trip_id)
      .order("spent_on", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => expenseInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("expenses")
      .insert({ ...data, user_id: context.userId })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("expenses")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });