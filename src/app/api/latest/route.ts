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

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const results = [];

  for (const station of stations) {
    const { data: readings } = await supabase
      .from("weather_readings")
      .select("temp_c, wind_speed_kph, precip_total_mm, temp_indoor_c, observed_at")
      .eq("station_id", station.id)
      .order("observed_at", { ascending: false })
      .limit(1);

    const { data: hourReadings } = await supabase
      .from("weather_readings")
      .select("wind_speed_kph")
      .eq("station_id", station.id)
      .gte("observed_at", oneHourAgo);

    const windValues = (hourReadings || [])
      .map((r) => r.wind_speed_kph)
      .filter((v): v is number => v !== null);

    const avgWind = windValues.length > 0
      ? Math.round((windValues.reduce((a, b) => a + b, 0) / windValues.length) * 10) / 10
      : null;

    results.push({
      ...station,
      latest: readings?.[0] ?? null,
      avg_wind_kph: avgWind,
    });
  }

  return NextResponse.json(results);
}
