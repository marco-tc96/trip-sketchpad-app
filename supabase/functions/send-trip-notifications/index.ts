// supabase/functions/send-trip-notifications/index.ts
// Deno edge function — runs on a cron schedule every 5 minutes.
// For each user with push subscriptions, checks for pending trip
// notifications and sends Web Push messages via VAPID.
//
// Required Supabase secrets:
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import webPush from "npm:web-push@3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:marco.colletta1996@gmail.com";

webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

// ── Country → IANA timezone map (representative timezone per country) ────────
const COUNTRY_TZ: Record<string, string> = {
  AF:"Asia/Kabul",AL:"Europe/Tirane",DZ:"Africa/Algiers",AD:"Europe/Andorra",AO:"Africa/Luanda",
  AG:"America/Antigua",AR:"America/Argentina/Buenos_Aires",AM:"Asia/Yerevan",AU:"Australia/Sydney",
  AT:"Europe/Vienna",AZ:"Asia/Baku",BS:"America/Nassau",BH:"Asia/Bahrain",BD:"Asia/Dhaka",
  BB:"America/Barbados",BY:"Europe/Minsk",BE:"Europe/Brussels",BZ:"America/Belize",
  BJ:"Africa/Porto-Novo",BT:"Asia/Thimphu",BO:"America/La_Paz",BA:"Europe/Sarajevo",
  BW:"Africa/Gaborone",BR:"America/Sao_Paulo",BN:"Asia/Brunei",BG:"Europe/Sofia",
  BF:"Africa/Ouagadougou",BI:"Africa/Bujumbura",CV:"Atlantic/Cape_Verde",KH:"Asia/Phnom_Penh",
  CM:"Africa/Douala",CA:"America/Toronto",CF:"Africa/Bangui",TD:"Africa/Ndjamena",
  CL:"America/Santiago",CN:"Asia/Shanghai",CO:"America/Bogota",KM:"Indian/Comoro",
  CG:"Africa/Brazzaville",CD:"Africa/Kinshasa",CR:"America/Costa_Rica",CI:"Africa/Abidjan",
  HR:"Europe/Zagreb",CU:"America/Havana",CY:"Asia/Nicosia",CZ:"Europe/Prague",
  DK:"Europe/Copenhagen",DJ:"Africa/Djibouti",DM:"America/Dominica",DO:"America/Santo_Domingo",
  EC:"America/Guayaquil",EG:"Africa/Cairo",SV:"America/El_Salvador",GQ:"Africa/Malabo",
  ER:"Africa/Asmara",EE:"Europe/Tallinn",SZ:"Africa/Mbabane",ET:"Africa/Addis_Ababa",
  FJ:"Pacific/Fiji",FI:"Europe/Helsinki",FR:"Europe/Paris",GA:"Africa/Libreville",
  GM:"Africa/Banjul",GE:"Asia/Tbilisi",DE:"Europe/Berlin",GH:"Africa/Accra",
  GI:"Europe/Gibraltar",GR:"Europe/Athens",GL:"America/Godthab",GD:"America/Grenada",
  GT:"America/Guatemala",GN:"Africa/Conakry",GW:"Africa/Bissau",GY:"America/Guyana",
  HT:"America/Port-au-Prince",VA:"Europe/Vatican",HN:"America/Tegucigalpa",HK:"Asia/Hong_Kong",
  HU:"Europe/Budapest",IS:"Atlantic/Reykjavik",IN:"Asia/Kolkata",ID:"Asia/Jakarta",
  IR:"Asia/Tehran",IQ:"Asia/Baghdad",IE:"Europe/Dublin",IL:"Asia/Jerusalem",IT:"Europe/Rome",
  JM:"America/Jamaica",JP:"Asia/Tokyo",JO:"Asia/Amman",KZ:"Asia/Almaty",KE:"Africa/Nairobi",
  KP:"Asia/Pyongyang",KR:"Asia/Seoul",KW:"Asia/Kuwait",KG:"Asia/Bishkek",LA:"Asia/Vientiane",
  LV:"Europe/Riga",LB:"Asia/Beirut",LS:"Africa/Maseru",LR:"Africa/Monrovia",LY:"Africa/Tripoli",
  LI:"Europe/Vaduz",LT:"Europe/Vilnius",LU:"Europe/Luxembourg",MO:"Asia/Macau",
  MG:"Indian/Antananarivo",MW:"Africa/Blantyre",MY:"Asia/Kuala_Lumpur",MV:"Indian/Maldives",
  ML:"Africa/Bamako",MT:"Europe/Malta",MH:"Pacific/Majuro",MR:"Africa/Nouakchott",
  MU:"Indian/Mauritius",MX:"America/Mexico_City",FM:"Pacific/Pohnpei",MD:"Europe/Chisinau",
  MC:"Europe/Monaco",MN:"Asia/Ulaanbaatar",ME:"Europe/Podgorica",MA:"Africa/Casablanca",
  MZ:"Africa/Maputo",MM:"Asia/Rangoon",NA:"Africa/Windhoek",NP:"Asia/Kathmandu",
  NL:"Europe/Amsterdam",NZ:"Pacific/Auckland",NI:"America/Managua",NE:"Africa/Niamey",
  NG:"Africa/Lagos",MK:"Europe/Skopje",NO:"Europe/Oslo",OM:"Asia/Muscat",PK:"Asia/Karachi",
  PW:"Pacific/Palau",PS:"Asia/Gaza",PA:"America/Panama",PG:"Pacific/Port_Moresby",
  PY:"America/Asuncion",PE:"America/Lima",PH:"Asia/Manila",PL:"Europe/Warsaw",PT:"Europe/Lisbon",
  QA:"Asia/Qatar",RE:"Indian/Reunion",RO:"Europe/Bucharest",RU:"Europe/Moscow",RW:"Africa/Kigali",
  SM:"Europe/San_Marino",ST:"Africa/Sao_Tome",SA:"Asia/Riyadh",SN:"Africa/Dakar",
  RS:"Europe/Belgrade",SC:"Indian/Mahe",SL:"Africa/Freetown",SG:"Asia/Singapore",
  SK:"Europe/Bratislava",SI:"Europe/Ljubljana",SB:"Pacific/Guadalcanal",SO:"Africa/Mogadishu",
  ZA:"Africa/Johannesburg",SS:"Africa/Juba",ES:"Europe/Madrid",LK:"Asia/Colombo",
  SD:"Africa/Khartoum",SR:"America/Paramaribo",SE:"Europe/Stockholm",CH:"Europe/Zurich",
  SY:"Asia/Damascus",TW:"Asia/Taipei",TJ:"Asia/Dushanbe",TZ:"Africa/Dar_es_Salaam",
  TH:"Asia/Bangkok",TL:"Asia/Dili",TG:"Africa/Lome",TO:"Pacific/Tongatapu",
  TT:"America/Port_of_Spain",TN:"Africa/Tunis",TR:"Europe/Istanbul",TM:"Asia/Ashgabat",
  TV:"Pacific/Funafuti",UG:"Africa/Kampala",UA:"Europe/Kiev",AE:"Asia/Dubai",
  GB:"Europe/London",US:"America/New_York",UY:"America/Montevideo",UZ:"Asia/Tashkent",
  VU:"Pacific/Efate",VE:"America/Caracas",VN:"Asia/Ho_Chi_Minh",YE:"Asia/Aden",
  ZM:"Africa/Lusaka",ZW:"Africa/Harare",KN:"America/St_Kitts",LC:"America/St_Lucia",
  VC:"America/St_Vincent",WS:"Pacific/Apia",
};

// ── Timezone helpers ──────────────────────────────────────────────────────────

function tzUtcOffsetMinutes(ianaTimezone: string, forDate: Date): number {
  const fmt = (tz: string) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hour12: false,
    }).format(forDate);
  const toMs = (s: string): number => {
    const [datePart, timePart] = s.split(", ");
    const [m, d, y] = datePart.split("/");
    return new Date(`${y}-${m}-${d}T${timePart}Z`).getTime();
  };
  return (toMs(fmt(ianaTimezone)) - toMs(fmt("UTC"))) / 60_000;
}

function naiveLocalToUtcMs(naiveDateStr: string, utcPlusMinutes: number): number {
  return new Date(naiveDateStr).getTime() - utcPlusMinutes * 60_000;
}

function localDateStr(ianaTimezone: string, forDate: Date): string {
  return new Intl.DateTimeFormat("sv", { timeZone: ianaTimezone }).format(forDate);
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (_req) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const now = new Date();
  const todayUtcStr = now.toISOString().slice(0, 10);

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
    const toSend: Array<{ title: string; body: string | null; link: string }> = [];

    // Fetch user profile for timezone
    const { data: profile } = await supabase
      .from("profiles")
      .select("timezone")
      .eq("id", userId)
      .maybeSingle();

    const userTz = (profile as any)?.timezone as string | null;
    const userLocalDate = userTz ? localDateStr(userTz, now) : todayUtcStr;
    const userUtcOffset = userTz ? tzUtcOffsetMinutes(userTz, now) : 0;

    const upsertAndCapture = async (
      row: Record<string, unknown>,
      notif: { title: string; body: string | null; link: string }
    ) => {
      const { data: inserted } = await (supabase.from("notifications") as any)
        .upsert(row, { onConflict: "user_id,notif_key", ignoreDuplicates: true })
        .select("id");
      if (inserted && inserted.length > 0) toSend.push(notif);
    };

    // ── 1. Trip-start — at user's local midnight ──────────────────────────
    const { data: startingTrips } = await supabase
      .from("trips")
      .select("id, title, start_date")
      .eq("user_id", userId)
      .eq("start_date", userLocalDate);

    for (const trip of startingTrips ?? []) {
      await upsertAndCapture(
        {
          user_id: userId,
          type: "trip_upcoming",
          title: "notif_trip_start",
          body: trip.title ?? null,
          link: `/trips/${trip.id}`,
          read: false,
          notif_key: `trip_start:${trip.id}:${trip.start_date}`,
          trip_id: trip.id,
          meta: {},
        },
        { title: "notif_trip_start", body: trip.title ?? null, link: `/trips/${trip.id}` }
      );
    }

    // ── 2. Departure — 1 hour before outbound start_at (user local time) ─
    const dep55Ms = now.getTime() + 55 * 60_000;
    const dep65Ms = now.getTime() + 65 * 60_000;
    const wideFrom = new Date(dep55Ms - Math.abs(userUtcOffset) * 60_000 - 3_600_000).toISOString();
    const wideTo   = new Date(dep65Ms + Math.abs(userUtcOffset) * 60_000 + 3_600_000).toISOString();

    const { data: depCandidates } = await supabase
      .from("itinerary_items")
      .select("id, trip_id, start_at, trips(title)")
      .eq("user_id", userId)
      .eq("kind", "outbound")
      .gte("start_at", wideFrom)
      .lte("start_at", wideTo);

    for (const item of depCandidates ?? []) {
      if (!item.start_at) continue;
      const actualDepUtcMs = naiveLocalToUtcMs(item.start_at as string, userUtcOffset);
      if (actualDepUtcMs < dep55Ms || actualDepUtcMs > dep65Ms) continue;
      const tripTitle = (item.trips as any)?.title ?? null;
      await upsertAndCapture(
        {
          user_id: userId,
          type: "trip_upcoming",
          title: "notif_departure",
          body: tripTitle,
          link: `/trips/${item.trip_id}`,
          read: false,
          notif_key: `departure_1h:${item.id}`,
          trip_id: item.trip_id,
          meta: {},
        },
        { title: "notif_departure", body: tripTitle, link: `/trips/${item.trip_id}` }
      );
    }

    // ── 3. Arrival — at outbound end_at (destination country's timezone) ──
    const arrFromMs = now.getTime() - 5 * 60_000;
    const arrToMs   = now.getTime() + 2 * 60_000;
    const arrWideFrom = new Date(arrFromMs - 12 * 3_600_000).toISOString();
    const arrWideTo   = new Date(arrToMs   + 12 * 3_600_000).toISOString();

    const { data: arrCandidates } = await supabase
      .from("itinerary_items")
      .select("id, trip_id, end_at, trips(title, country)")
      .eq("user_id", userId)
      .eq("kind", "outbound")
      .gte("end_at", arrWideFrom)
      .lte("end_at", arrWideTo);

    for (const item of arrCandidates ?? []) {
      if (!item.end_at) continue;
      const tripData = item.trips as { title?: string; country?: string | null } | null;
      const countryIso = tripData?.country ?? null;

      let destOffset = 0;
      if (countryIso) {
        const destTz = COUNTRY_TZ[countryIso.toUpperCase()];
        if (destTz) destOffset = tzUtcOffsetMinutes(destTz, now);
      }

      const actualArrUtcMs = naiveLocalToUtcMs(item.end_at as string, destOffset);
      if (actualArrUtcMs < arrFromMs || actualArrUtcMs > arrToMs) continue;

      let titleKey: string;
      let bodyKey: string | null = null;
      let meta: Record<string, unknown> = {};

      if (countryIso) {
        // Fetch trips ending by today, excluding the current trip.
        const { data: rawTrips } = await supabase
          .from("trips")
          .select("id, country, end_date")
          .eq("user_id", userId)
          .not("country", "is", null)
          .neq("id", item.trip_id)
          .lte("end_date", todayUtcStr);

        // For trips whose end_date is today, check whether the inbound (return)
        // flight has actually landed — only then the trip is truly concluded.
        const todayTrips = (rawTrips ?? []).filter((t: any) => t.end_date === todayUtcStr);
        const concludedTodayIds = new Set<string>();

        if (todayTrips.length > 0) {
          const { data: inboundItems } = await supabase
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
              const inboundUtcMs = naiveLocalToUtcMs(inbound.end_at as string, userUtcOffset);
              if (inboundUtcMs <= nowMs) concludedTodayIds.add(trip.id);
            }
          }
        }

        const all = (rawTrips ?? []).filter(
          (t: any) => t.end_date < todayUtcStr || concludedTodayIds.has(t.id)
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

      await upsertAndCapture(
        {
          user_id: userId,
          type: "trip_ongoing",
          title: titleKey,
          body: bodyKey,
          link: `/trips/${item.trip_id}`,
          read: false,
          notif_key: `arrival:${item.id}`,
          trip_id: item.trip_id,
          meta,
        },
        { title: titleKey, body: bodyKey, link: `/trips/${item.trip_id}` }
      );
    }

    // ── Send Web Push ─────────────────────────────────────────────────────
    for (const notif of toSend) {
      for (const sub of userSubs as any[]) {
        try {
          await webPush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify({ title: notif.title, body: notif.body, link: notif.link })
          );
        } catch (e: any) {
          if (e?.statusCode === 410) {
            await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
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
