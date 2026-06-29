import { NextResponse } from "next/server";
import { getSupabasePublic } from "@/lib/supabase";

const r1 = (n: number) => Math.round(n * 10) / 10;
const mean = (v: number[]) => (v.length ? r1(v.reduce((a, b) => a + b, 0) / v.length) : null);

interface DayRow {
  temp_c: number | null;
  wind_speed_kph: number | null;
  wind_gust_kph: number | null;
}

export interface TodayStats {
  tempHigh: number | null;
  tempLow: number | null;
  tempAvg: number | null;
  windAvg: number | null;
  gust: number | null;
  rain: number | null;
}

/** Structured daily aggregates from the last 24h of readings (plus today's rain). */
function todayStats(rows: DayRow[], rainToday: number | null): TodayStats {
  const temps = rows.map((r) => r.temp_c).filter((v): v is number => v !== null);
  const winds = rows.map((r) => r.wind_speed_kph).filter((v): v is number => v !== null);
  const gusts = rows.map((r) => r.wind_gust_kph).filter((v): v is number => v !== null);
  return {
    tempHigh: temps.length ? r1(Math.max(...temps)) : null,
    tempLow: temps.length ? r1(Math.min(...temps)) : null,
    tempAvg: mean(temps),
    windAvg: mean(winds),
    gust: gusts.length ? r1(Math.max(...gusts)) : null,
    rain: rainToday,
  };
}

/**
 * One-line plain-English headline for a station card, derived from the day's
 * aggregates: temperature range, rainfall, and peak gust. Deterministic and
 * cheap — no LLM. Returns null when there is nothing useful to say.
 */
function buildSummary(t: TodayStats): string | null {
  const parts: string[] = [];
  if (t.tempHigh !== null && t.tempLow !== null) parts.push(`High ${t.tempHigh}° / low ${t.tempLow}°`);
  if (t.rain !== null) parts.push(t.rain > 0 ? `${r1(t.rain)} mm rain` : "dry");
  if (t.gust !== null && t.gust > 0) parts.push(`gusts to ${t.gust} km/h`);
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
          .select("temp_c, wind_speed_kph, wind_gust_kph")
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
      const today = todayStats(dayReadings ?? [], latest?.precip_total_mm ?? null);

      return {
        ...station,
        latest,
        avg_wind_kph: avgWind,
        today,
        summary: buildSummary(today),
      };
    })
  );

  return NextResponse.json(results);
}
