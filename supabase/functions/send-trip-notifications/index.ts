// supabase/functions/send-trip-notifications/index.ts
// Deno edge function — runs on a cron schedule every 5 minutes.
// For each user with push subscriptions, checks for pending trip
// notifications and sends Web Push messages via VAPID.
//
// Required Supabase secrets (set via dashboard or CLI):
//   VAPID_PUBLIC_KEY   — generated with: npx web-push generate-vapid-keys
//   VAPID_PRIVATE_KEY  — same command
//   VAPID_SUBJECT      — e.g. "mailto:admin@yourdomain.com"
//
// Schedule setup (Supabase Dashboard → Database → Cron):
//   Name:     send-trip-notifications
//   Schedule: */5 * * * *
//   Command:  SELECT net.http_post(
//               url := '<SUPABASE_URL>/functions/v1/send-trip-notifications',
//               headers := '{"Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb,
//               body := '{}'::jsonb
//             );

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import webPush from "npm:web-push@3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:marco.colletta1996@gmail.com";

webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

// ── Italian ordinals ──────────────────────────────────────────────────────────

function ordinalItM(n: number): string {
  const map: Record<number, string> = {
    1: "primo", 2: "secondo", 3: "terzo", 4: "quarto", 5: "quinto",
    6: "sesto", 7: "settimo", 8: "ottavo", 9: "nono", 10: "decimo",
  };
  return map[n] ?? `${n}°`;
}

function ordinalItF(n: number): string {
  const map: Record<number, string> = {
    1: "prima", 2: "seconda", 3: "terza", 4: "quarta", 5: "quinta",
    6: "sesta", 7: "settima", 8: "ottava", 9: "nona", 10: "decima",
  };
  return map[n] ?? `${n}°`;
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (_req) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  // Fetch all push subscriptions grouped by user
  const { data: allSubs, error: subsError } = await supabase
    .from("push_subscriptions")
    .select("user_id, endpoint, p256dh, auth");

  if (subsError) {
    console.error("Failed to fetch push_subscriptions:", subsError.message);
    return new Response(JSON.stringify({ error: subsError.message }), { status: 500 });
  }

  const userIds = [...new Set((allSubs ?? []).map((s: any) => s.user_id as string))];

  for (const userId of userIds) {
    const userSubs = (allSubs ?? []).filter((s: any) => s.user_id === userId);
    // Collect newly inserted notifications to push
    const toSend: Array<{ title: string; body: string | null; link: string }> = [];

    // Helper: upsert + detect if it was newly created (empty data = duplicate)
    const upsertAndCapture = async (
      row: Record<string, unknown>,
      notif: { title: string; body: string | null; link: string }
    ) => {
      const { data: inserted } = await (supabase.from("notifications") as any)
        .upsert(row, { onConflict: "user_id,notif_key", ignoreDuplicates: true })
        .select("id");
      if (inserted && inserted.length > 0) toSend.push(notif);
    };

    // ── 1. Trip-start ─────────────────────────────────────────────────────
    const { data: startingTrips } = await supabase
      .from("trips")
      .select("id, title, start_date")
      .eq("user_id", userId)
      .eq("start_date", todayStr);

    for (const trip of startingTrips ?? []) {
      const title = "Un nuovo viaggio sta per iniziare";
      const body = trip.title ?? null;
      await upsertAndCapture(
        {
          user_id: userId,
          type: "trip_upcoming",
          title,
          body,
          link: `/trips/${trip.id}`,
          read: false,
          notif_key: `trip_start:${trip.id}:${trip.start_date}`,
          trip_id: trip.id,
        },
        { title, body, link: `/trips/${trip.id}` }
      );
    }

    // ── 2. Departure — 1 hour before outbound start_at ───────────────────
    const dep55 = new Date(now.getTime() + 55 * 60_000).toISOString();
    const dep65 = new Date(now.getTime() + 65 * 60_000).toISOString();

    const { data: departures } = await supabase
      .from("itinerary_items")
      .select("id, trip_id, trips(title)")
      .eq("user_id", userId)
      .eq("kind", "outbound")
      .gte("start_at", dep55)
      .lte("start_at", dep65);

    for (const item of departures ?? []) {
      const tripTitle = (item.trips as any)?.title ?? null;
      const title = "Manca un'ora alla partenza";
      await upsertAndCapture(
        {
          user_id: userId,
          type: "trip_upcoming",
          title,
          body: tripTitle,
          link: `/trips/${item.trip_id}`,
          read: false,
          notif_key: `departure_1h:${item.id}`,
          trip_id: item.trip_id,
        },
        { title, body: tripTitle, link: `/trips/${item.trip_id}` }
      );
    }

    // ── 3. Arrival — at outbound end_at (window: -5 min / +2 min) ────────
    const arrFrom = new Date(now.getTime() - 5 * 60_000).toISOString();
    const arrTo = new Date(now.getTime() + 2 * 60_000).toISOString();

    const { data: arrivals } = await supabase
      .from("itinerary_items")
      .select("id, trip_id, trips(title, country)")
      .eq("user_id", userId)
      .eq("kind", "outbound")
      .gte("end_at", arrFrom)
      .lte("end_at", arrTo);

    for (const item of arrivals ?? []) {
      const tripData = item.trips as { title?: string; country?: string | null } | null;
      const country = tripData?.country ?? null;

      let title: string;
      let body: string | null = null;

      if (country) {
        const { data: pastTrips } = await supabase
          .from("trips")
          .select("id, country")
          .eq("user_id", userId)
          .not("country", "is", null)
          .lte("end_date", todayStr);

        const all = (pastTrips ?? []) as { id: string; country: string }[];
        const sameCountry = all.filter((t) => t.country === country);
        const uniqueCountries = new Set(all.map((t) => t.country));

        if (sameCountry.length <= 1) {
          title = `Benvenuto in ${country}`;
          body = `Questo è il tuo ${ordinalItM(uniqueCountries.size)} paese visitato`;
        } else {
          title = `Bentornato in ${country}`;
          body = `Questa è la ${ordinalItF(sameCountry.length)} volta in questo paese`;
        }
      } else {
        title = "Benvenuto!";
        body = tripData?.title ?? null;
      }

      await upsertAndCapture(
        {
          user_id: userId,
          type: "trip_ongoing",
          title,
          body,
          link: `/trips/${item.trip_id}`,
          read: false,
          notif_key: `arrival:${item.id}`,
          trip_id: item.trip_id,
        },
        { title, body, link: `/trips/${item.trip_id}` }
      );
    }

    // ── Send Web Push for newly created notifications ─────────────────────
    for (const notif of toSend) {
      for (const sub of userSubs as any[]) {
        try {
          await webPush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify({ title: notif.title, body: notif.body, link: notif.link })
          );
        } catch (e: any) {
          // 410 Gone = subscription expired → clean it up
          if (e?.statusCode === 410) {
            await supabase
              .from("push_subscriptions")
              .delete()
              .eq("endpoint", sub.endpoint);
          } else {
            console.error("Push send failed:", e?.message ?? e);
          }
        }
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, users: userIds.length }), {
    headers: { "Content-Type": "application/json" },
  });
});
