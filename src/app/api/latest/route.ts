import { NextResponse } from "next/server";
import { getSupabasePublic } from "@/lib/supabase";

const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * One-line plain-English headline for a station card, derived from the last 24h
 * of readings: today's temperature range, rainfall, and peak gust. Deterministic
 * and cheap — no LLM. Returns null when there is nothing useful to say.
 */
function buildSummary(
  rows: { temp_c: number | null; wind_gust_kph: number | null }[],
  rainToday: number | null
): string | null {
  const parts: string[] = [];

  const temps = rows.map((r) => r.temp_c).filter((v): v is number => v !== null);
  if (temps.length) parts.push(`High ${r1(Math.max(...temps))}° / low ${r1(Math.min(...temps))}°`);

  if (rainToday !== null) parts.push(rainToday > 0 ? `${r1(rainToday)} mm rain` : "dry");

  const gusts = rows.map((r) => r.wind_gust_kph).filter((v): v is number => v !== null);
  const peakGust = gusts.length ? Math.max(...gusts) : 0;
  if (peakGust > 0) parts.push(`gusts to ${r1(peakGust)} km/h`);

  return parts.length ? parts.join(" · ") : null;
}

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
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Resolve all stations concurrently rather than sequentially — this endpoint
  // is polled every 60s by the home page, so the previous serial N+1 loop was
  // the dominant source of latency.
  const results = await Promise.all(
    stations.map(async (station) => {
      const [{ data: readings }, { data: hourReadings }, { data: dayReadings }] = await Promise.all([
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
        supabase
          .from("weather_readings")
          .select("temp_c, wind_gust_kph")
          .eq("station_id", station.id)
          .gte("observed_at", oneDayAgo),
      ]);

      const windValues = (hourReadings || [])
        .map((r) => r.wind_speed_kph)
        .filter((v): v is number => v !== null);

      const avgWind =
        windValues.length > 0
          ? Math.round((windValues.reduce((a, b) => a + b, 0) / windValues.length) * 10) / 10
          : null;

      const latest = readings?.[0] ?? null;

      return {
        ...station,
        latest,
        avg_wind_kph: avgWind,
        summary: buildSummary(dayReadings ?? [], latest?.precip_total_mm ?? null),
      };
    })
  );

  return NextResponse.json(results);
}
