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

export const checkUsernameAvailable = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ username: z.string().min(1).max(40) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { count, error } = await context.supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("username", data.username)
      .neq("id", context.userId);
    if (error) throw new Error(error.message);
    return { available: (count ?? 0) === 0 };
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
        birth_country: z.string().max(3).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    // Check username uniqueness server-side before updating
    if (data.username) {
      const { count } = await context.supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("username", data.username)
        .neq("id", context.userId);
      if ((count ?? 0) > 0) {
        throw new Error("username_taken");
      }
    }

    const { data: row, error } = await context.supabase
      .from("profiles")
      .update(data)
      .eq("id", context.userId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });
