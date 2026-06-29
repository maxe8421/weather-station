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

  // Resolve all stations concurrently rather than sequentially — this endpoint
  // is polled every 60s by the home page, so the previous serial N+1 loop was
  // the dominant source of latency.
  const results = await Promise.all(
    stations.map(async (station) => {
      const [{ data: readings }, { data: hourReadings }] = await Promise.all([
        supabase
          .from("weather_readings")
          .select("temp_c, wind_speed_kph, precip_total_mm, temp_indoor_c, observed_at")
          .eq("station_id", station.id)
          .order("observed_at", { ascending: false })
          .limit(1),
        supabase
          .from("weather_readings")
          .select("wind_speed_kph")
          .eq("station_id", station.id)
          .gte("observed_at", oneHourAgo),
      ]);

      const windValues = (hourReadings || [])
        .map((r) => r.wind_speed_kph)
        .filter((v): v is number => v !== null);

      const avgWind =
        windValues.length > 0
          ? Math.round((windValues.reduce((a, b) => a + b, 0) / windValues.length) * 10) / 10
          : null;

      return {
        ...station,
        latest: readings?.[0] ?? null,
        avg_wind_kph: avgWind,
      };
    })
  );

  return NextResponse.json(results);
}
