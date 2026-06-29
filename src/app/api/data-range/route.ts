import { NextRequest, NextResponse } from "next/server";
import { getSupabasePublic } from "@/lib/supabase";
import { isValidUuid } from "@/lib/auth";

/** Earliest and latest reading timestamps for a station (for the date picker bounds). */
export async function GET(request: NextRequest) {
  const stationId = request.nextUrl.searchParams.get("station_id");
  if (!isValidUuid(stationId)) {
    return NextResponse.json({ error: "A valid station_id is required" }, { status: 400 });
  }

  const supabase = getSupabasePublic();
  const [{ data: first }, { data: last }, { data: dailyFirst }] = await Promise.all([
    supabase
      .from("weather_readings")
      .select("observed_at")
      .eq("station_id", stationId)
      .order("observed_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("weather_readings")
      .select("observed_at")
      .eq("station_id", stationId)
      .order("observed_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Earliest day in the persisted rollup (retained beyond the 90-day raw window).
    supabase
      .from("daily_readings")
      .select("day")
      .eq("station_id", stationId)
      .order("day", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  return NextResponse.json({
    min: first?.observed_at ?? null,
    max: last?.observed_at ?? null,
    dailyMin: dailyFirst?.day ?? null,
  });
}
