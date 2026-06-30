import { NextRequest, NextResponse } from "next/server";
import { getSupabasePublic } from "@/lib/supabase";
import { isValidUuid } from "@/lib/auth";

const DAILY_COLUMNS =
  "day, temp_avg, temp_min, temp_max, temp_indoor_c, feels_like_c, dewpoint_c, humidity, pressure_mb, wind_speed_kph, wind_gust_kph, wind_dir, precip_total_mm, precip_rate_mm, uv, solar_radiation";

async function fetchDaily(
  supabase: ReturnType<typeof getSupabasePublic>,
  stationId: string,
  from: string,
  to: string
) {
  const { data, error } = await supabase
    .from("daily_readings")
    .select(DAILY_COLUMNS)
    .eq("station_id", stationId)
    .gte("day", from)
    .lt("day", to)
    .order("day", { ascending: true })
    .limit(5000); // explicit cap so long windows never silently truncate at 1000
  return { data: data ?? [], error };
}

async function fetchRaw(
  supabase: ReturnType<typeof getSupabasePublic>,
  stationId: string,
  from: string,
  to: string
) {
  const { data, error } = await supabase
    .from("weather_readings")
    .select("*")
    .eq("station_id", stationId)
    .gte("observed_at", from)
    .lt("observed_at", to)
    .order("observed_at", { ascending: true })
    .limit(400);
  return { data: data ?? [], error };
}

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const stationId = p.get("station_id");
  const aFrom = p.get("aFrom");
  const aTo = p.get("aTo");
  const bFrom = p.get("bFrom");
  const bTo = p.get("bTo");

  if (!isValidUuid(stationId)) {
    return NextResponse.json({ error: "A valid station_id is required" }, { status: 400 });
  }
  if (!aFrom || !aTo || !bFrom || !bTo) {
    return NextResponse.json({ error: "aFrom, aTo, bFrom, bTo are required" }, { status: 400 });
  }

  const supabase = getSupabasePublic();
  const fetchWindow = p.get("g") === "raw" ? fetchRaw : fetchDaily;
  const [a, b] = await Promise.all([
    fetchWindow(supabase, stationId, aFrom, aTo),
    fetchWindow(supabase, stationId, bFrom, bTo),
  ]);

  if (a.error || b.error) {
    return NextResponse.json({ error: a.error?.message || b.error?.message }, { status: 500 });
  }

  return NextResponse.json({ a: a.data, b: b.data });
}
