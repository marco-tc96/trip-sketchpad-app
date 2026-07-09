import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { primaryTimezoneOfCountry } from "@/lib/country-data";

export type AppNotification = {
  id: string;
  type: "info" | "trip_upcoming" | "trip_ongoing" | "trip_ended";
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  created_at: string;
  meta: Record<string, unknown> | null;
};

// ── Timezone helpers ──────────────────────────────────────────────────────────

/**
 * Returns the UTC+ offset in minutes for an IANA timezone at a given date.
 * e.g. "Europe/Rome" in summer → +120
 */
function tzUtcOffsetMinutes(ianaTimezone: string, forDate: Date): number {
  const fmt = (tz: string) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hour12: false,
    }).format(forDate);

  const toMs = (s: string): number => {
    // "MM/DD/YYYY, HH:MM:SS" → epoch (treating as UTC for diff purposes)
    const [datePart, timePart] = s.split(", ");
    const [m, d, y] = datePart.split("/");
    return new Date(`${y}-${m}-${d}T${timePart}Z`).getTime();
  };

  return (toMs(fmt(ianaTimezone)) - toMs(fmt("UTC"))) / 60_000;
}

/**
 * Converts a naive local-time ISO string (stored without TZ info, e.g. "2026-07-03T10:00:00")
 * to its actual UTC milliseconds, given the UTC+ offset of the source timezone.
 */
function naiveLocalToUtcMs(naiveDateStr: string, utcPlusMinutes: number): number {
  // Server (Node) parses naive ISO as UTC; subtract the UTC+ offset to get actual UTC
  return new Date(naiveDateStr).getTime() - utcPlusMinutes * 60_000;
}

// ── Notification functions ────────────────────────────────────────────────────

/** Return up to 50 notifications for the current user, newest-first. */
export const listNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("notifications")
      .select("id, type, title, body, link, read, created_at, meta")
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

// ── Push subscription management ─────────────────────────────────────────────

export const subscribePush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ endpoint: z.string(), p256dh: z.string(), auth: z.string() }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { data: { user } } = await context.supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");
    const { error } = await (context.supabase.from("push_subscriptions") as any).upsert(
      { user_id: user.id, endpoint: data.endpoint, p256dh: data.p256dh, auth: data.auth },
      { onConflict: "user_id,endpoint" }
    );
    if (error) throw new Error(error.message);
  });

export const unsubscribePush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ endpoint: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: { user } } = await context.supabase.auth.getUser();
    if (!user) return;
    const { error } = await (context.supabase.from("push_subscriptions") as any)
      .delete()
      .eq("user_id", user.id)
      .eq("endpoint", data.endpoint);
    if (error) throw new Error(error.message);
  });

// ── Trip notification checker ─────────────────────────────────────────────────

/**
 * Checks and inserts trip-related notifications for the current user.
 * Called by NotificationBootstrap every 5 minutes when the app is open.
 *
 * @param localDate         - User's local date as "YYYY-MM-DD"
 * @param utcOffsetMinutes  - User's UTC+ offset in minutes (e.g. +120 for UTC+2)
 */
export const checkTripNotifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      utcOffsetMinutes: z.number().int().min(-840).max(840).default(0),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { data: { user } } = await context.supabase.auth.getUser();
    if (!user) return;

    const now = new Date();
    const { localDate, utcOffsetMinutes } = data;

    const upsertNotif = async (row: Record<string, unknown>) => {
      await (context.supabase.from("notifications") as any).upsert(row, {
        onConflict: "user_id,notif_key",
        ignoreDuplicates: true,
      });
    };

    // ── 1. Trip-start — fires on the user's local calendar day ───────────
    const { data: startingTrips } = await context.supabase
      .from("trips")
      .select("id, title, start_date")
      .eq("start_date", localDate);

    for (const trip of startingTrips ?? []) {
      await upsertNotif({
        user_id: user.id,
        type: "trip_upcoming",
        title: "notif_trip_start",
        body: trip.title ?? null,
        link: `/trips/${trip.id}`,
        read: false,
        notif_key: `trip_start:${trip.id}:${trip.start_date}`,
        trip_id: trip.id,
        meta: {},
      });
    }

    // ── 2. Departure — 1 hour before outbound start_at (user local time) ─
    // Window: [now+55min, now+65min] in UTC
    const dep55Ms = now.getTime() + 55 * 60_000;
    const dep65Ms = now.getTime() + 65 * 60_000;

    // Fetch all outbound items and filter by adjusted time
    // We need to fetch a wider window to avoid missing due to offset
    const wideFrom = new Date(dep55Ms - Math.abs(utcOffsetMinutes) * 60_000 - 60_000 * 60).toISOString();
    const wideTo   = new Date(dep65Ms + Math.abs(utcOffsetMinutes) * 60_000 + 60_000 * 60).toISOString();

    const { data: depCandidates } = await context.supabase
      .from("itinerary_items")
      .select("id, trip_id, start_at, trips(title)")
      .eq("kind", "outbound")
      .gte("start_at", wideFrom)
      .lte("start_at", wideTo);

    for (const item of depCandidates ?? []) {
      if (!item.start_at) continue;
      const actualDepUtcMs = naiveLocalToUtcMs(item.start_at, utcOffsetMinutes);
      if (actualDepUtcMs >= dep55Ms && actualDepUtcMs <= dep65Ms) {
        const tripTitle = (item.trips as any)?.title ?? null;
        await upsertNotif({
          user_id: user.id,
          type: "trip_upcoming",
          title: "notif_departure",
          body: tripTitle,
          link: `/trips/${item.trip_id}`,
          read: false,
          notif_key: `departure_1h:${item.id}`,
          trip_id: item.trip_id,
          meta: {},
        });
      }
    }

    // ── 3. Arrival — at outbound end_at (destination local time) ─────────
    // Window: [now-5min, now+2min] in UTC
    const arrFromMs = now.getTime() - 5 * 60_000;
    const arrToMs   = now.getTime() + 2 * 60_000;

    const { data: arrCandidates } = await context.supabase
      .from("itinerary_items")
      .select("id, trip_id, end_at, trips(title, country)")
      .eq("kind", "outbound")
      .gte("end_at", wideFrom)
      .lte("end_at", wideTo);

    for (const item of arrCandidates ?? []) {
      if (!item.end_at) continue;
      const tripData = item.trips as { title?: string; country?: string | null } | null;
      const countryIso = tripData?.country ?? null;

      // Compute destination UTC+ offset
      let destOffset = 0;
      if (countryIso) {
        const destTz = primaryTimezoneOfCountry(countryIso);
        if (destTz) destOffset = tzUtcOffsetMinutes(destTz, now);
      }

      const actualArrUtcMs = naiveLocalToUtcMs(item.end_at, destOffset);
      if (actualArrUtcMs < arrFromMs || actualArrUtcMs > arrToMs) continue;

      const todayStr = now.toISOString().slice(0, 10);

      let titleKey: string;
      let bodyKey: string | null = null;
      let meta: Record<string, unknown> = {};

      if (countryIso) {
        // Fetch trips ending by today, excluding the current trip.
        const { data: rawTrips } = await context.supabase
          .from("trips")
          .select("id, country, end_date")
          .not("country", "is", null)
          .neq("id", item.trip_id)
          .lte("end_date", todayStr);

        // For trips whose end_date is today, check whether the inbound (return)
        // flight has actually landed — only then the trip is truly concluded.
        const todayTrips = (rawTrips ?? []).filter((t: any) => t.end_date === todayStr);
        const concludedTodayIds = new Set<string>();

        if (todayTrips.length > 0) {
          const { data: inboundItems } = await context.supabase
            .from("itinerary_items")
            .select("trip_id, end_at")
            .eq("kind", "inbound")
            .in("trip_id", todayTrips.map((t: any) => t.id));

          const nowMs = now.getTime();
          for (const trip of todayTrips) {
            const inbound = (inboundItems ?? []).find((i: any) => i.trip_id === trip.id);
            if (!inbound?.end_at) {
              // No return flight stored → treat as concluded when end_date is reached
              concludedTodayIds.add(trip.id);
            } else {
              const inboundUtcMs = naiveLocalToUtcMs(inbound.end_at as string, utcOffsetMinutes);
              if (inboundUtcMs <= nowMs) concludedTodayIds.add(trip.id);
            }
          }
        }

        const all = (rawTrips ?? []).filter(
          (t: any) => t.end_date < todayStr || concludedTodayIds.has(t.id)
        ) as { id: string; country: string }[];

        const sameCountry = all.filter((t) => t.country === countryIso);
        const uniqueCountries = new Set(all.map((t) => t.country));
        // Always include the country we just arrived in.
        uniqueCountries.add(countryIso);

        if (sameCountry.length === 0) {
          // First time visiting this country
          titleKey = "notif_arrival_new";
          bodyKey  = "notif_arrival_new_body";
          meta = { country_iso: countryIso, n: uniqueCountries.size };
        } else {
          // Returning: past ended trips + this one
          titleKey = "notif_arrival_return";
          bodyKey  = "notif_arrival_return_body";
          meta = { country_iso: countryIso, n: sameCountry.length + 1 };
        }
      } else {
        titleKey = "notif_arrival_generic";
        meta = {};
      }

      await upsertNotif({
        user_id: user.id,
        type: "trip_ongoing",
        title: titleKey,
        body: bodyKey,
        link: `/trips/${item.trip_id}`,
        read: false,
        notif_key: `arrival:${item.id}`,
        trip_id: item.trip_id,
        meta,
      });
    }
  });

/** Delete a single notification by id. */
export const deleteNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("notifications")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
  });

/** Delete ALL notifications for the current user (RLS filters to own rows). */
export const deleteAllNotifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("notifications")
      .delete()
      .not("id", "is", null);
    if (error) throw new Error(error.message);
  });
