import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type AppNotification = {
  id: string;
  type: "info" | "trip_upcoming" | "trip_ongoing" | "trip_ended";
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  created_at: string;
};

/** Return up to 50 notifications for the current user, newest-first. */
export const listNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("notifications")
      .select("id, type, title, body, link, read, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return (data ?? []) as AppNotification[];
  });

/** Lightweight count query — used by the dock badge. */
export const countUnreadNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { count, error } = await context.supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("read", false);
    if (error) throw new Error(error.message);
    return { count: count ?? 0 };
  });

/** Mark a single notification as read. */
export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("notifications")
      .update({ read: true })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
  });

/** Mark ALL unread notifications as read. */
export const markAllNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("notifications")
      .update({ read: true })
      .eq("read", false);
    if (error) throw new Error(error.message);
  });
