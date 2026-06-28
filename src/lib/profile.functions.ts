import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const getProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select("*")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) {
      // backstop in case the trigger didn't run
      const ins = await context.supabase
        .from("profiles")
        .insert({ id: context.userId })
        .select()
        .single();
      if (ins.error) throw new Error(ins.error.message);
      return ins.data;
    }
    return data;
  });

export const updateProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        home_currency: z.string().length(3).optional(),
        language: z.string().min(2).max(5).optional(),
        display_name: z.string().max(80).optional().nullable(),
        username: z.string().max(40).optional().nullable(),
        home_country: z.string().max(3).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("profiles")
      .update(data)
      .eq("id", context.userId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });
