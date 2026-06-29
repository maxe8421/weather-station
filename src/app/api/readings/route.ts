import { NextRequest, NextResponse } from "next/server";
import { getSupabasePublic } from "@/lib/supabase";
import { isValidUuid } from "@/lib/auth";
import { TimeRange } from "@/lib/types";

// Generous caps for raw ranges so we never silently hit PostgREST's 1000-row
// default. At one reading / 10 min: 24h≈144, 7d≈1008, 30d≈4320.
const RAW_LIMITS: Record<string, number> = {
  "24h": 200,
  "7d": 1200,
  "30d": 4600,
};

const VALID_RANGES: TimeRange[] = ["24h", "7d", "30d", "1y", "all"];

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

  // The latest raw reading is returned independently of range so that the
  // current-conditions panel always shows live values, even when the charts
  // are showing daily aggregates.
  const latestPromise = supabase
    .from("weather_readings")
    .select("*")
    .eq("station_id", stationId)
    .order("observed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Long ranges are aggregated to daily buckets in Postgres. This avoids both
  // the row-cap truncation and multi-megabyte payloads, and keeps day buckets
  // year-correct (a year is part of each bucket key in SQL).
  if (range === "1y" || range === "all") {
    const [{ data: daily, error }, { data: latest }] = await Promise.all([
      supabase.rpc("readings_daily", {
        p_station_id: stationId,
        p_from: from.toISOString(),
      }),
      latestPromise,
    ]);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ mode: "daily", data: daily ?? [], latest: latest ?? null });
  }

  // Raw ranges: fetch the most recent N (descending) then reverse to ascending,
  // guaranteeing we return the newest data and never silently truncate.
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

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ascending = (data ?? []).slice().reverse();
  return NextResponse.json({ mode: "raw", data: ascending, latest: latest ?? null });
}
