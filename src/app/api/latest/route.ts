import { NextResponse } from "next/server";
import { getSupabasePublic } from "@/lib/supabase";

export async function GET() {
  const supabase = getSupabasePublic();

  const { data: stations, error: stationsError } = await supabase
    .from("stations")
    .select("*")
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });

  if (stationsError || !stations) {
    return NextResponse.json({ error: stationsError?.message }, { status: 500 });
  }

  const results = [];

  for (const station of stations) {
    const { data: readings } = await supabase
      .from("weather_readings")
      .select("temp_c, wind_speed_kph, precip_total_mm, temp_indoor_c, observed_at")
      .eq("station_id", station.id)
      .order("observed_at", { ascending: false })
      .limit(1);

    results.push({
      ...station,
      latest: readings?.[0] ?? null,
    });
  }

  return NextResponse.json(results);
}
