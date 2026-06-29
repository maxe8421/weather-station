import { NextRequest, NextResponse } from "next/server";
import { getSupabasePublic } from "@/lib/supabase";
import { isValidUuid } from "@/lib/auth";
import { TimeRange } from "@/lib/types";

// Generous caps for raw ranges so we never silently hit PostgREST's 1000-row
// default. At one reading / 10 min: 24h≈144, 7d≈1008.
const RAW_LIMITS: Record<string, number> = {
  "24h": 200,
  "7d": 1200,
};

const VALID_RANGES: TimeRange[] = ["24h", "7d", "30d", "1y", "all"];

// Columns selected from the persisted daily rollup table (matches DailyReading).
const DAILY_COLUMNS =
  "day, temp_avg, temp_min, temp_max, temp_indoor_c, feels_like_c, dewpoint_c, humidity, pressure_mb, wind_speed_kph, wind_gust_kph, wind_dir, precip_total_mm, precip_rate_mm, uv, solar_radiation";

function windowStart(range: TimeRange, now: number): Date {
  switch (range) {
    case "24h":
      return new Date(now - 24 * 60 * 60 * 1000);
    case "7d":
      return new Date(now - 7 * 24 * 60 * 60 * 1000);
    case "30d":
      return new Date(now - 30 * 24 * 60 * 60 * 1000);
    case "1y":
      return new Date(now - 365 * 24 * 60 * 60 * 1000);
    case "all":
      return new Date(0);
  }
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const stationId = params.get("station_id");
  const rangeParam = (params.get("range") || "24h") as TimeRange;

  if (!isValidUuid(stationId)) {
    return NextResponse.json(
      { error: "A valid station_id (UUID) is required" },
      { status: 400 }
    );
  }
  const range: TimeRange = VALID_RANGES.includes(rangeParam) ? rangeParam : "24h";

  const supabase = getSupabasePublic();
  const from = windowStart(range, Date.now());

  // Current conditions stay live regardless of range.
  const latestPromise = supabase
    .from("weather_readings")
    .select("*")
    .eq("station_id", stationId)
    .order("observed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // 30d: aggregate from raw on the server (raw is within the 90-day retention
  // window) — keeps the chart live while shrinking the payload to ~30 rows.
  if (range === "30d") {
    const [{ data: daily, error }, { data: latest }] = await Promise.all([
      supabase.rpc("readings_daily", { p_station_id: stationId, p_from: from.toISOString() }),
      latestPromise,
    ]);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ mode: "daily", data: daily ?? [], latest: latest ?? null });
  }

  // 1y / all: read the persisted daily rollup so long ranges keep working after
  // raw rows are pruned, and transfer only ~one row per day.
  if (range === "1y" || range === "all") {
    const fromDate = from.toISOString().slice(0, 10);
    const [{ data: daily, error }, { data: latest }] = await Promise.all([
      supabase
        .from("daily_readings")
        .select(DAILY_COLUMNS)
        .eq("station_id", stationId)
        .gte("day", fromDate)
        .order("day", { ascending: true }),
      latestPromise,
    ]);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ mode: "daily", data: daily ?? [], latest: latest ?? null });
  }

  // 24h / 7d: raw rows. Fetch most-recent-first with an explicit cap, then
  // reverse to ascending so we never silently truncate the tail.
  const [{ data, error }, { data: latest }] = await Promise.all([
    supabase
      .from("weather_readings")
      .select("*")
      .eq("station_id", stationId)
      .gte("observed_at", from.toISOString())
      .order("observed_at", { ascending: false })
      .limit(RAW_LIMITS[range]),
    latestPromise,
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ascending = (data ?? []).slice().reverse();
  return NextResponse.json({ mode: "raw", data: ascending, latest: latest ?? null });
}
